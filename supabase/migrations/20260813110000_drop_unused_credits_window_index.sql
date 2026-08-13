-- ============================================================================
-- FeedbackLoop - drop unused index
--
-- user_credits_window_start_idx on public.user_credits (window_start) has never
-- been used: quota/plan logic always reads the row by its user_id primary key
-- (try_reserve_analysis_slot and friends), so the btree on window_start only
-- adds write overhead. Flagged by the Supabase performance advisor.
-- ============================================================================

drop index if exists public.user_credits_window_start_idx;
