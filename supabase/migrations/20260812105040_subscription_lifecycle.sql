-- ============================================================================
-- FeedbackLoop — subscription lifecycle (Lemon Squeezy)
-- Extends user_credits with live subscription state (status, renewal/end
-- dates, cancellation-at-period-end, variant + billing interval) and adds a
-- subscription_events log that serves as webhook idempotency + billing audit.
--
-- Security: clients can SELECT their own row only. Writes happen exclusively
-- through the service-role webhook route (secret key, RLS bypassed).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- user_credits — live subscription state
-- ---------------------------------------------------------------------------
alter table public.user_credits
  add column if not exists subscription_status text
    check (
      subscription_status is null or
      subscription_status in (
        'on_trial', 'active', 'paused', 'past_due',
        'unpaid', 'cancelled', 'expired'
      )
    ),
  add column if not exists renews_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists variant_id text,
  add column if not exists billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year'));

-- ---------------------------------------------------------------------------
-- subscription_events — webhook audit log (idempotency via unique event id)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_events (
  id bigint generated always as identity primary key,
  ls_event_id text unique not null,
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_user_id_idx
  on public.subscription_events (user_id, created_at desc);

alter table public.subscription_events enable row level security;

drop policy if exists "subscription_events_select_own" on public.subscription_events;
create policy "subscription_events_select_own" on public.subscription_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants for the Data API
-- ---------------------------------------------------------------------------
revoke all on public.subscription_events from anon;
revoke all on public.subscription_events from authenticated;
grant select on public.subscription_events to authenticated;
grant insert, update, delete on public.subscription_events to service_role;