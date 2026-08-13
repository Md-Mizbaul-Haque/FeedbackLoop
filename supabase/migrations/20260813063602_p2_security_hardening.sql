-- ============================================================================
-- FeedbackLoop — P2: security hardening
--
-- 1. P2-1: widget_id uniqueness. The public widget endpoint resolves a summary
--    by widget_id with maybeSingle(), so duplicates would turn the widget into
--    a 500. Live data was checked for duplicates before this migration: the
--    index below is safe to create and future collisions fail at the DB.
-- 2. P2-9: quota caps move to a single source of truth — the quota_caps table.
--    try_reserve_analysis_slot reads its caps from that table (falling back to
--    the previous constants if the row is ever missing) and keeps clamping
--    caller-supplied values, so the DB remains the final authority. The
--    analyze-summaries edge function now reads the caps through
--    get_quota_caps() instead of duplicating them.
-- 3. P2-7: list_summaries_page — server-side, keyset-paginated summaries list
--    (stable order: created_at desc, id desc), page size clamped to [1, 50],
--    auth.uid() guarded so a caller can never read another user's rows.
-- 4. P2-8: grant hardening — anon loses DML grants on tables it has no
--    business touching (RLS was the only defense); authenticated loses write
--    grants on the legacy analysis_usage ledger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- P2-1: widget_id uniqueness
-- ---------------------------------------------------------------------------
create unique index if not exists summaries_widget_id_unique_idx
  on public.summaries (widget_id);

-- ---------------------------------------------------------------------------
-- P2-9: quota caps — single source of truth
-- ---------------------------------------------------------------------------
create table if not exists public.quota_caps (
  singleton boolean primary key default true check (singleton),
  free_limit integer not null default 10 check (free_limit >= 1),
  pro_daily_limit integer not null default 50 check (pro_daily_limit >= 1),
  pro_monthly_limit integer not null default 400 check (pro_monthly_limit >= 1),
  pro_concurrency_limit integer not null default 3 check (pro_concurrency_limit >= 1)
);

insert into public.quota_caps (singleton, free_limit, pro_daily_limit, pro_monthly_limit, pro_concurrency_limit)
values (true, 10, 50, 400, 3)
on conflict (singleton) do nothing;

alter table public.quota_caps enable row level security;
-- No policies and no client grants: the table is reachable only through the
-- security definer RPCs below (try_reserve_analysis_slot, get_quota_caps).
revoke all on public.quota_caps from anon, authenticated;

-- get_quota_caps — lets the edge function learn the caps instead of
-- duplicating them. Values are not sensitive; only the auth.uid() gate matters.
create or replace function public.get_quota_caps()
returns table (
  free_limit integer,
  pro_daily_limit integer,
  pro_monthly_limit integer,
  pro_concurrency_limit integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
    select q.free_limit, q.pro_daily_limit, q.pro_monthly_limit, q.pro_concurrency_limit
      from public.quota_caps q
     where q.singleton;
end;
$$;

revoke all on function public.get_quota_caps() from public, anon;
grant execute on function public.get_quota_caps() to authenticated;

-- Rework try_reserve_analysis_slot to read caps from quota_caps. Behavior is
-- identical when the row exists (it does): caller values are still clamped to
-- the server-side caps, so clients can never raise their own limits.
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
    if v_row.concurrent >= p_concurrency_limit then
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

    update public.user_credits
       set concurrent = concurrent + 1,
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

revoke execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  from public, anon;
grant execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- P2-7: server-side summaries pagination
-- Keyset pagination over (created_at, id): the client passes the last row's
-- created_at + id as the cursor; stable ordering never skips or duplicates
-- rows even when new summaries are created between pages.
-- ---------------------------------------------------------------------------
create index if not exists summaries_user_created_id_idx
  on public.summaries (user_id, created_at desc, id desc);

create or replace function public.list_summaries_page(
  p_page_size integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
) returns table (
  id uuid,
  title text,
  reviews_count integer,
  keywords jsonb,
  created_at timestamptz,
  has_more boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_size integer;
begin
  if v_uid is null then
    return;
  end if;

  v_size := greatest(1, least(coalesce(p_page_size, 20), 50));

  return query
    select p.id, p.title, p.reviews_count, p.keywords, p.created_at,
           exists (
             select 1
               from public.summaries s
              where s.user_id = v_uid
                and (s.created_at, s.id) < (p.created_at, p.id)
           ) as has_more
      from (
        select s.id, s.title, s.reviews_count, s.keywords, s.created_at
          from public.summaries s
         where s.user_id = v_uid
           and (
             p_cursor_created_at is null
             or p_cursor_id is null
             or (s.created_at, s.id) < (p_cursor_created_at, p_cursor_id)
           )
         order by s.created_at desc, s.id desc
         limit v_size
      ) p
     order by p.created_at desc, p.id desc;
end;
$$;

revoke all on function public.list_summaries_page(integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.list_summaries_page(integer, timestamptz, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- P2-8: grant hardening
-- anon never reads or writes these tables directly — the public widget route
-- and the webhook run with the service role, and everything else requires an
-- authenticated session. RLS remains the primary defense for authenticated.
-- ---------------------------------------------------------------------------
revoke all on public.summaries from anon;
revoke all on public.profiles from anon;
revoke all on public.user_settings from anon;
revoke all on public.analysis_usage from anon;
-- Legacy hourly ledger: nothing writes it anymore (P1 moved usage onto
-- user_credits via the RPCs). Reads remain permitted for the authenticated
-- role; writes are revoked.
revoke insert, update, delete on public.analysis_usage from authenticated;
