-- ============================================================================
-- FeedbackLoop — structured analysis insights
-- Adds a jsonb column to store the rich, evidence-based analysis produced by
-- the analyze-summaries edge function. Backward compatible: existing rows
-- keep working with a degraded, legacy view until re-analyzed.
-- ============================================================================

alter table public.summaries
  add column if not exists analysis jsonb;