-- Training Routine schema
create table public.exercises (
  id bigint generated always as identity primary key,
  name text not null unique,
  muscle text not null
);

create table public.plans (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text
);

create table public.plan_days (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.plans(id) on delete cascade,
  position int not null,
  name text not null,
  is_rest boolean not null default false,
  unique (plan_id, position)
);

create table public.plan_exercises (
  id bigint generated always as identity primary key,
  plan_day_id bigint not null references public.plan_days(id) on delete cascade,
  position int not null,
  exercise_id bigint not null references public.exercises(id),
  label text not null,
  target_reps int[] not null,
  unit text not null default 'reps' check (unit in ('reps','steps')),
  cue text,
  rest_seconds int not null default 90,
  unique (plan_day_id, position)
);
create index on public.plan_exercises (exercise_id);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  active_plan_id bigint references public.plans(id),
  next_position int not null default 0,
  default_rest_seconds int not null default 90,
  updated_at timestamptz not null default now()
);
create index on public.user_settings (active_plan_id);

create table public.workout_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_day_id bigint references public.plan_days(id),
  day_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text
);
create index on public.workout_sessions (user_id, started_at desc);
create index on public.workout_sessions (plan_day_id);

create table public.set_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id bigint not null references public.workout_sessions(id) on delete cascade,
  plan_exercise_id bigint references public.plan_exercises(id),
  exercise_id bigint not null references public.exercises(id),
  set_number int not null,
  weight_kg numeric(6,2) not null default 0,
  reps int not null,
  logged_at timestamptz not null default now(),
  unique (session_id, plan_exercise_id, set_number)
);
create index on public.set_logs (user_id, exercise_id, logged_at desc);
create index on public.set_logs (session_id);
create index on public.set_logs (plan_exercise_id);
create index on public.set_logs (exercise_id);

create table public.bodyweight_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  weight_kg numeric(5,2) not null,
  unique (user_id, logged_on)
);

create table public.measurements (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  chest_cm numeric(5,1), waist_cm numeric(5,1), arm_cm numeric(5,1),
  thigh_cm numeric(5,1), calf_cm numeric(5,1), shoulders_cm numeric(5,1),
  neck_cm numeric(5,1), body_fat_pct numeric(4,1),
  unique (user_id, logged_on)
);

-- RLS
alter table public.exercises enable row level security;
alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.user_settings enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.bodyweight_logs enable row level security;
alter table public.measurements enable row level security;

create policy "read exercises" on public.exercises for select to authenticated using (true);
create policy "read plans" on public.plans for select to authenticated using (true);
create policy "read plan_days" on public.plan_days for select to authenticated using (true);
create policy "read plan_exercises" on public.plan_exercises for select to authenticated using (true);

create policy "own settings" on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sessions" on public.workout_sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sets" on public.set_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own bodyweight" on public.bodyweight_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own measurements" on public.measurements for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Single-user lock: only the owner's email can create an account; auto-confirm it.
create or replace function public.restrict_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) <> 'mohamed@el-samman.com' then
    raise exception 'Sign-ups are disabled for this app';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;
revoke execute on function public.restrict_signups() from public, anon, authenticated;

create trigger restrict_signups before insert on auth.users
  for each row execute function public.restrict_signups();
