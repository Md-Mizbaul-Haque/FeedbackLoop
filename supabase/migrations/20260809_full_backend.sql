-- ============================================================================
-- FeedbackLoop — full Supabase backend schema
-- Tables, storage, RLS, rate-limit RPC.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- summaries
-- ---------------------------------------------------------------------------
create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  reviews_count integer not null default 0,
  keywords jsonb not null default '[]'::jsonb,
  summary_points jsonb not null default '[]'::jsonb,
  positive_sentiment_pct integer not null default 0,
  average_rating numeric not null default 0,
  reviews text,
  widget_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists summaries_user_id_idx on public.summaries (user_id);
create index if not exists summaries_widget_id_idx on public.summaries (widget_id);
create index if not exists summaries_created_at_idx on public.summaries (created_at desc);

alter table public.summaries enable row level security;

create policy "summaries_select_own" on public.summaries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "summaries_insert_own" on public.summaries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "summaries_update_own" on public.summaries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "summaries_delete_own" on public.summaries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_settings_insert_own" on public.user_settings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_settings_update_own" on public.user_settings
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- profiles (business name / website)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '',
  website text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- analysis_usage — hourly rate-limit ledger
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_usage_user_bucket_idx
  on public.analysis_usage (user_id, bucket);

alter table public.analysis_usage enable row level security;

create policy "analysis_usage_select_own" on public.analysis_usage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "analysis_usage_insert_own" on public.analysis_usage
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- try_reserve_analysis_slot — atomic per-user hourly reservation
-- SECURITY INVOKER: RLS applies; auth.uid() guard prevents anon calls.
-- ---------------------------------------------------------------------------
create or replace function public.try_reserve_analysis_slot(p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_bucket timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  select count(*) into v_count
    from public.analysis_usage
   where user_id = v_user
     and bucket = v_bucket;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.analysis_usage (user_id, bucket)
  values (v_user, v_bucket);

  return true;
end;
$$;

revoke execute on function public.try_reserve_analysis_slot(integer) from public;
revoke execute on function public.try_reserve_analysis_slot(integer) from anon;
grant execute on function public.try_reserve_analysis_slot(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- signup_verifications — OTP flow ledger (service-role only)
-- ---------------------------------------------------------------------------
create table if not exists public.signup_verifications (
  email text primary key,
  code_hash text not null,
  attempts integer not null default 0,
  send_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.signup_verifications enable row level security;
-- No policies: only the service-role client (bypasses RLS) touches this table.

-- ---------------------------------------------------------------------------
-- Storage: avatars bucket (private, per-user folders)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2621440,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 2621440,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[];

create policy "avatars_select_own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_insert_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Grants for the Data API (anon / authenticated roles)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.summaries to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.analysis_usage to authenticated;
