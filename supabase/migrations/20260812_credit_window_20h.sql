-- ============================================================================
-- FeedbackLoop — per-user 10 credits / 24h + Pro plan (Lemon Squeezy)
-- Replaces the hourly analysis_usage ledger with a per-user rolling window.
-- A free user gets 10 credits; the window starts at first use in a cycle and
-- resets 24 hours later. Pro users are never limited.
--
-- Security: clients can SELECT their own row only. All writes happen through
-- the security definer RPCs below (auth.uid() guarded), so users can neither
-- zero out their usage nor flip their own plan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- user_credits — per-user rolling credit window + plan
-- ---------------------------------------------------------------------------
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  used integer not null default 0,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  ls_customer_id text,
  ls_subscription_id text,
  updated_at timestamptz not null default now()
);

create index if not exists user_credits_window_start_idx
  on public.user_credits (window_start);

alter table public.user_credits enable row level security;

drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own" on public.user_credits
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- try_reserve_analysis_slot — atomic per-user credit reservation
-- Security definer (postgres owner, RLS bypassed): the auth.uid() guard is
-- the only gate, so callers can only ever touch their own row.
-- Pro users bypass the limit entirely. Free users get p_limit credits in a
-- 24-hour window starting at the first use of the cycle.
-- ---------------------------------------------------------------------------
create or replace function public.try_reserve_analysis_slot(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_credits%rowtype;
begin
  if v_uid is null then
    return false;
  end if;

  select * into v_row
    from public.user_credits
   where user_id = v_uid;

  -- Pro users are never limited.
  if v_row.plan = 'pro' then
    return true;
  end if;

  if v_row.user_id is null then
    -- First use: start a new window with one credit consumed.
    insert into public.user_credits (user_id, window_start, used)
    values (v_uid, now(), 1);
    return true;
  end if;

  -- Window expired: reset and consume one credit.
  if now() >= v_row.window_start + interval '24 hours' then
    update public.user_credits
       set used = 1,
           window_start = now(),
           updated_at = now()
     where user_id = v_uid;
    return true;
  end if;

  -- Within the window: enforce the limit.
  if v_row.used >= p_limit then
    return false;
  end if;

  update public.user_credits
     set used = used + 1,
         updated_at = now()
   where user_id = v_uid;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_analysis_slot — refund one credit (called when a generation fails)
-- ---------------------------------------------------------------------------
create or replace function public.release_analysis_slot()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  update public.user_credits
     set used = greatest(used - 1, 0),
         updated_at = now()
   where user_id = v_uid
     and used > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_user_plan — the user's current plan ('free' | 'pro')
-- ---------------------------------------------------------------------------
create or replace function public.get_user_plan()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  select plan into v_plan
    from public.user_credits
   where user_id = auth.uid();
  return coalesce(v_plan, 'free');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the Data API
-- ---------------------------------------------------------------------------
revoke all on public.user_credits from anon;
revoke all on public.user_credits from authenticated;
grant select on public.user_credits to authenticated;

revoke execute on function public.try_reserve_analysis_slot(integer) from public;
revoke execute on function public.try_reserve_analysis_slot(integer) from anon;
grant execute on function public.try_reserve_analysis_slot(integer) to authenticated;

grant execute on function public.release_analysis_slot() to authenticated;
grant execute on function public.get_user_plan() to authenticated;

revoke execute on function public.release_analysis_slot() from public, anon;
revoke execute on function public.get_user_plan() from public, anon;
