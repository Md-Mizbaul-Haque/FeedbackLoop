-- ============================================================================
-- FeedbackLoop — P1-C: concurrency slot lease/TTL recovery
--
-- PROBLEM: try_reserve_analysis_slot counted in-flight analyses with a plain
-- integer (user_credits.concurrent); release_analysis_slot decremented it.
-- If the analyze-summaries edge function crashed or timed out between reserve
-- and release, the slot was consumed forever and a user could be blocked at
-- the concurrency cap indefinitely.
--
-- FIX: in-flight analyses are now tracked as per-run LEASES with a server-side
-- expiry. analysis_leases holds one row per reserved run with a TTL of 10
-- minutes — comfortably beyond the worst realistic run (rich LLM call with a
-- 120s client timeout + legacy fallback + normalization overhead), so an
-- active analysis is never reclaimed early. A crashed run's lease expires and
-- is reclaimed atomically during the user's next reservation attempt (under
-- the same row lock), so recovery requires no background job and no
-- reservation is ever permanently blocked. The user_credits.concurrent column
-- is kept as an observability mirror of the active lease count.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Per-run leases
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_leases_user_expires_idx
  on public.analysis_leases (user_id, expires_at);

alter table public.analysis_leases enable row level security;
-- No policies: only the security definer quota RPCs touch this table
-- (service_role bypasses RLS; anon/authenticated have no grants at all).
revoke all on public.analysis_leases from anon, authenticated;

-- ---------------------------------------------------------------------------
-- try_reserve_analysis_slot — concurrency enforced through lease expiry
-- ---------------------------------------------------------------------------
drop function if exists public.try_reserve_analysis_slot(integer, integer, integer, integer);

create or replace function public.try_reserve_analysis_slot(
  p_limit integer default null,
  p_pro_daily_limit integer default null,
  p_pro_monthly_limit integer default null,
  p_concurrency_limit integer default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_credits%rowtype;
  v_is_pro boolean;
  v_caps public.quota_caps%rowtype;
  v_active integer;
  v_lease_ttl interval := interval '10 minutes';
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  -- Caps come from the quota_caps table (single source of truth). If the row
  -- is ever missing, fall back to the historical constants so the RPC still
  -- enforces limits.
  select * into v_caps from public.quota_caps where singleton;

  p_limit := least(
    coalesce(p_limit, coalesce(v_caps.free_limit, 10)),
    coalesce(v_caps.free_limit, 10)
  );
  p_pro_daily_limit := least(
    coalesce(p_pro_daily_limit, coalesce(v_caps.pro_daily_limit, 50)),
    coalesce(v_caps.pro_daily_limit, 50)
  );
  p_pro_monthly_limit := least(
    coalesce(p_pro_monthly_limit, coalesce(v_caps.pro_monthly_limit, 400)),
    coalesce(v_caps.pro_monthly_limit, 400)
  );
  p_concurrency_limit := least(
    coalesce(p_concurrency_limit, coalesce(v_caps.pro_concurrency_limit, 3)),
    coalesce(v_caps.pro_concurrency_limit, 3)
  );

  insert into public.user_credits (user_id, plan)
  values (v_uid, 'free')
  on conflict (user_id) do nothing;

  select * into v_row
    from public.user_credits
   where user_id = v_uid
     for update;

  v_is_pro := public.is_pro_subscription_active(
    v_row.plan, v_row.subscription_status, v_row.ends_at
  );

  if v_row.plan = 'pro' and not v_is_pro then
    update public.user_credits
       set plan = 'free', concurrent = 0, updated_at = now()
     where user_id = v_uid;
    v_row.plan := 'free';
  end if;

  if v_is_pro then
    -- Recover crashed runs: leases whose TTL expired are reclaimed atomically
    -- while holding the user's row lock, so a future reservation can never be
    -- permanently blocked by an abandoned in-flight slot.
    delete from public.analysis_leases
     where user_id = v_uid
       and expires_at <= now();

    select count(*) into v_active
      from public.analysis_leases
     where user_id = v_uid
       and expires_at > now();

    if v_active >= p_concurrency_limit then
      return 'concurrency';
    end if;

    if v_row.pro_daily_start is null
       or now() >= v_row.pro_daily_start + interval '24 hours' then
      v_row.pro_daily_start := now();
      v_row.pro_daily_used := 0;
    end if;
    if v_row.pro_daily_used >= p_pro_daily_limit then
      return 'pro_daily';
    end if;

    if v_row.pro_month_start is null
       or now() >= v_row.pro_month_start + interval '30 days' then
      v_row.pro_month_start := now();
      v_row.pro_month_used := 0;
    end if;
    if v_row.pro_month_used >= p_pro_monthly_limit then
      return 'pro_monthly';
    end if;

    insert into public.analysis_leases (user_id, expires_at)
    values (v_uid, now() + v_lease_ttl);

    update public.user_credits
       set concurrent = v_active + 1,
           pro_daily_used = v_row.pro_daily_used + 1,
           pro_month_used = v_row.pro_month_used + 1,
           pro_daily_start = v_row.pro_daily_start,
           pro_month_start = v_row.pro_month_start,
           updated_at = now()
     where user_id = v_uid;
    return 'ok';
  end if;

  if now() >= v_row.window_start + interval '24 hours' then
    update public.user_credits
       set used = 1, window_start = now(), updated_at = now()
     where user_id = v_uid;
    return 'ok';
  end if;

  if v_row.used >= p_limit then
    return 'free_limit';
  end if;

  update public.user_credits
     set used = used + 1, updated_at = now()
   where user_id = v_uid;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- release_analysis_slot — drop this run's lease, keep the mirror in sync
-- ---------------------------------------------------------------------------
drop function if exists public.release_analysis_slot(boolean);

create or replace function public.release_analysis_slot(
  p_failed boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_credits%rowtype;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_row
    from public.user_credits
   where user_id = v_uid
     for update;

  if v_row.user_id is null then
    return;
  end if;

  if public.is_pro_subscription_active(
    v_row.plan, v_row.subscription_status, v_row.ends_at
  ) then
    -- Drop this run's lease (oldest active one). If none exists — a double
    -- release, or a lease that already expired server-side — only the mirror
    -- counter is adjusted, floored at zero.
    delete from public.analysis_leases
     where id = (
       select id
         from public.analysis_leases
        where user_id = v_uid
          and expires_at > now()
        order by created_at, id
        limit 1
     );
    update public.user_credits
       set concurrent = greatest(concurrent - 1, 0), updated_at = now()
     where user_id = v_uid;
  elsif p_failed then
    update public.user_credits
       set used = greatest(used - 1, 0), updated_at = now()
     where user_id = v_uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the Data API (unchanged from the P1/P2 definitions)
-- ---------------------------------------------------------------------------
revoke execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  from public, anon;
grant execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  to authenticated;

revoke execute on function public.release_analysis_slot(boolean) from public, anon;
grant execute on function public.release_analysis_slot(boolean) to authenticated;