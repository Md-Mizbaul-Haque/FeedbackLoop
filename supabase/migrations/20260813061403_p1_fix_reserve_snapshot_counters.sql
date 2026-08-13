-- ============================================================================
-- FeedbackLoop — P1 hotfix: reserve snapshot counters
--
-- HISTORY: this migration was applied to production as 20260813061403, shortly
-- after 20260813060644 (p1_quota_and_abuse). The quota RPC as first applied
-- incremented the daily/monthly counters directly on the live columns while
-- the window-reset assignments were computed on a rowtype snapshot; after a
-- window reset the two could disagree (the increment re-read a stale value,
-- so the "first use in a fresh window" could land above 1). This hotfix
-- rewrote the RPC to snapshot BOTH the window starts and the counters into the
-- rowtype before writing, so the reset and the increment commit in one
-- consistent statement. The local copy of 20260813_p1_quota_and_abuse.sql
-- already carries this shape, so on a fresh environment this file replays the
-- same function definition and is safe (drop + recreate of an identical body);
-- it exists so the migration history faithfully matches what production
-- applied. P2 later reworked this same RPC to read caps from quota_caps.
-- ============================================================================

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

    -- Rolling 24h window for the daily cap. The snapshot semantics below are
    -- the point of this hotfix: the window start and counter are captured in
    -- the rowtype first, and the write applies the snapshot values, so a
    -- reset and the increment always commit consistently.
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

revoke execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  from public, anon;
grant execute on function public.try_reserve_analysis_slot(integer, integer, integer, integer)
  to authenticated;
