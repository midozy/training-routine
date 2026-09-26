-- Apple Health import (read) and workout write-back bookkeeping.
-- Applied to project training-routine on 2026-09-26.

-- 1. Raw + daily-aggregated Health data, one row per sample / day / night.
create table public.health_samples (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('body_mass','body_fat','lean_mass','height','resting_hr','steps','active_energy','sleep')),
  day date not null,
  value numeric not null,
  unit text not null,
  start_at timestamptz,
  end_at timestamptz,
  source text,
  external_id text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, external_id)
);
create index health_samples_user_kind_day on public.health_samples (user_id, kind, day desc);

alter table public.health_samples enable row level security;
create policy "own health samples" on public.health_samples for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 2. Where a bodyweight entry came from; manual entries always win over Health.
alter table public.bodyweight_logs
  add column source text not null default 'manual' check (source in ('manual','apple_health')),
  add column external_id text;

-- 3. Workout write-back and Apple Watch stats for a session.
alter table public.workout_sessions
  add column health_workout_id text,
  add column avg_hr numeric(5,1),
  add column max_hr numeric(5,1),
  add column active_kcal numeric(7,1);
