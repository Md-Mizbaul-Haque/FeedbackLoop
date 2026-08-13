-- ============================================================================
-- FeedbackLoop — P1: server-side quota enforcement + signup abuse protection
--
-- 1. Pro subscription liveness is enforced in the database (P1-1): Pro
--    benefits apply only while the subscription is active/on_trial/past_due/
--    cancelled and (when set) the paid period has not ended. Stale 'pro'
--    rows self-heal back to 'free' inside the RPCs.
-- 2. Pro AI usage is capped per user (P1-2): 50 summaries / 24h rolling,
--    400 summaries / 30d rolling, 3 in-flight analyses. All caps are
--    enforced here as constants — caller-supplied values are clamped, so
--    nobody can raise their own limits by invoking the RPC directly.
-- 3. Signup abuse protection (P1-3): a row-locked, windowed rate-limit
--    ledger (signup_rate_limits + rate_limit_take) used by the signup-otp
--    routes for per-email / per-IP / global buckets.
--
-- Security: rate_limit_take is service-role only. The quota RPCs stay
-- auth.uid() guarded security definers with an empty search_path.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- P1-2: Pro quota + concurrency columns on user_credits
-- ---------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists pro_daily_start timestamptz,
  add column if not exists pro_daily_used integer not null default 0,
  add column if not exists pro_month_start timestamptz,
  add column if not exists pro_month_used integer not null default 0,
  add column if not exists concurrent integer not null default 0;

-- ---------------------------------------------------------------------------
-- P1-1: active-Pro predicate (shared by the quota RPCs)
-- stable (uses now()); security invoker; not reachable by clients.
-- ---------------------------------------------------------------------------
create or replace function public.is_pro_subscription_active(
  p_plan text,
  p_status text,
  p_ends_at timestamptz
) returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_plan = 'pro'
     and coalesce(p_status, '') in ('active', 'on_trial', 'past_due', 'cancelled')
     and (p_ends_at is null or p_ends_at > now());
$$;

revoke all on function public.is_pro_subscription_active(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.is_pro_subscription_active(text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- P1-1 + P1-2: reworked try_reserve_analysis_slot
-- Returns a text verdict ('ok' | 'free_limit' | 'pro_daily' | 'pro_monthly'
-- | 'concurrency' | 'unauthorized') instead of a boolean, so the caller can
-- distinguish which cap was hit. The whole check is atomic: the user's row
-- is locked for update, all gates are evaluated before anything increments.
-- ---------------------------------------------------------------------------
drop function if exists public.try_reserve_analysis_slot(integer);

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
  v_free_limit constant integer := 10;
  v_pro_daily_cap constant integer := 50;
  v_pro_monthly_cap constant integer := 400;
  v_pro_concurrency_cap constant integer := 3;
begin
  if v_uid is null then
    return 'unauthorized';
  end if;

  -- Caller-supplied values are clamped to the server-side caps, so clients
  -- cannot raise their own limits by passing larger numbers.
  p_limit := least(coalesce(p_limit, v_free_limit), v_free_limit);
  p_pro_daily_limit := least(coalesce(p_pro_daily_limit, v_pro_daily_cap), v_pro_daily_cap);
  p_pro_monthly_limit := least(coalesce(p_pro_monthly_limit, v_pro_monthly_cap), v_pro_monthly_cap);
  p_concurrency_limit := least(coalesce(p_concurrency_limit, v_pro_concurrency_cap), v_pro_concurrency_cap);

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

  -- Self-heal: a stale 'pro' row (subscription expired / cancelled past its
  -- paid period) reverts to 'free' before any quota decision is made.
  if v_row.plan = 'pro' and not v_is_pro then
    update public.user_credits
       set plan = 'free', concurrent = 0, updated_at = now()
     where user_id = v_uid;
    v_row.plan := 'free';
  end if;

  if v_is_pro then
    -- In-flight analyses must never exceed the concurrency cap.
    if v_row.concurrent >= p_concurrency_limit then
      return 'concurrency';
    end if;

    -- Rolling 24h window for the daily cap.
    if v_row.pro_daily_start is null
       or now() >= v_row.pro_daily_start + interval '24 hours' then
      v_row.pro_daily_start := now();
      v_row.pro_daily_used := 0;
    end if;
    if v_row.pro_daily_used >= p_pro_daily_limit then
      return 'pro_daily';
    end if;

    -- Rolling 30d window for the monthly cap.
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

  -- Free users: rolling 24h window, capped at v_free_limit.
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
-- P1-1 + P1-2: release_analysis_slot
-- Pro: always frees one in-flight slot (success or failure — a failed run
-- never completes, so its slot must drop either way).
-- Free: refunds a credit only when the run failed.
-- ---------------------------------------------------------------------------
drop function if exists public.release_analysis_slot();

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
-- P1-1: get_user_plan — self-healing plan lookup
-- ---------------------------------------------------------------------------
create or replace function public.get_user_plan()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_status text;
  v_ends_at timestamptz;
begin
  if v_uid is null then
    return 'free';
  end if;

  insert into public.user_credits (user_id, plan)
  values (v_uid, 'free')
  on conflict (user_id) do nothing;

  select plan, subscription_status, ends_at
    into v_plan, v_status, v_ends_at
    from public.user_credits
   where user_id = v_uid;

  if v_plan = 'pro'
     and not public.is_pro_subscription_active(v_plan, v_status, v_ends_at) then
    update public.user_credits
       set plan = 'free', concurrent = 0, updated_at = now()
     where user_id = v_uid;
    return 'free';
  end if;

  return coalesce(v_plan, 'free');
end;
$$;

-- ---------------------------------------------------------------------------
-- P1-3: signup rate-limit ledger + take
-- Row-locked counter per bucket key; the window slides from the bucket's
-- window_start (a bucket whose window is exhausted gets a fresh window with
-- count 1). Service-role only — routes call it with the secret key.
-- ---------------------------------------------------------------------------
create table if not exists public.signup_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.signup_rate_limits enable row level security;
-- No policies: only service_role (bypasses RLS) touches this table.

create or replace function public.rate_limit_take(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.signup_rate_limits%rowtype;
begin
  if p_key is null or p_limit is null or p_limit <= 0
     or p_window_seconds is null or p_window_seconds <= 0 then
    return true;
  end if;

  insert into public.signup_rate_limits (bucket_key)
  values (p_key)
  on conflict (bucket_key) do nothing;

  select * into v_row
    from public.signup_rate_limits
   where bucket_key = p_key
     for update;

  if now() >= v_row.window_start + make_interval(secs => p_window_seconds) then
    update public.signup_rate_limits
       set window_start = now(), count = 1, updated_at = now()
     where bucket_key = p_key;
    return true;
  end if;

  if v_row.count >= p_limit then
    return false;
  end if;

  update public.signup_rate_limits
     set count = count + 1, updated_at = now()
   where bucket_key = p_key;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the Data API
-- ---------------------------------------------------------------------------
revoke all on public.signup_rate_limits from anon, authenticated;

revoke execute on function public.rate_limit_take(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, integer, integer)
  to service_role;

revoke execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  from public, anon;
grant execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  to authenticated;

revoke execute on function public.release_analysis_slot(boolean) from public, anon;
grant execute on function public.release_analysis_slot(boolean) to authenticated;

revoke execute on function public.get_user_plan() from public, anon;
grant execute on function public.get_user_plan() to authenticated;
