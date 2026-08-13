-- ============================================================================
-- FeedbackLoop — P1-A: out-of-order Lemon Squeezy webhook protection
--
-- user_credits gains the authoritative "last applied event timestamp"
-- (ls_updated_at = the subscription/order resource's attributes.updated_at,
-- which Lemon Squeezy bumps with microsecond precision on every change). The
-- webhook route compares each incoming event against this value and refuses
-- to apply any event whose timestamp is older than the state already
-- recorded, so a delayed retry delivery can never roll back newer state.
-- The compare-and-set happens inside a single UPDATE ... WHERE predicate (see
-- route.ts applyPlanState), so the protection is atomic at the database level
-- and holds across serverless instances.
-- ============================================================================

alter table public.user_credits
  add column if not exists ls_updated_at timestamptz;