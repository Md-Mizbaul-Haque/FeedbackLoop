-- ============================================================================
-- FeedbackLoop — P3: production hardening from the readiness review
--
-- 1. P3-1: close the free-tier quota bypass in release_analysis_slot.
--    Previously the `elsif p_failed` branch decremented the caller's free
--    `used` counter on a fully client-controlled flag. Any authenticated
--    client could call release_analysis_slot(true) after every successful
--    analysis and keep their 10/day free cap at zero — unlimited free usage
--    with no LLM contact. The refund branch is removed: quota accounting is
--    purely server-side. Failed free runs keep their reserved credit (a minor,
--    acceptable UX trade-off for enforceable limits). Pro runs are unaffected:
--    they still drop their lease + concurrency mirror on release.
-- 2. P3-2: belt-and-braces revoke on signup_verifications. RLS (deny-all) is
--    the active defense and the table keeps OTP code hashes; unlike its
--    sibling service-only tables it never had an explicit grant revoke, so a
--    future accidental policy/grant change would expose the hashes.
-- ============================================================================

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
  end if;
  -- P3-1: the former `elsif p_failed then used := greatest(used - 1, 0)`
  -- branch is intentionally removed. It rewarded clients that always pass
  -- p_failed = true and permanently defeated the free quota cap. `p_failed`
  -- remains in the signature for call compatibility (the edge function still
  -- passes it on failures), but it no longer touches any counter.
end;
$$;

-- P3-2: explicit revoke on the OTP verification table.
revoke all on public.signup_verifications from anon, authenticated;