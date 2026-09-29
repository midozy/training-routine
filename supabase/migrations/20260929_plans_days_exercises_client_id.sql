-- Applied to project danzdvismbezkymgstfu on 2026-09-29 (migration name: plans_days_exercises_client_id).
-- Offline Phase 3: rows created offline get a phone-made UUID so a retried sync can't duplicate them.
alter table public.plans          add column if not exists client_id uuid;
alter table public.plan_days      add column if not exists client_id uuid;
alter table public.plan_exercises add column if not exists client_id uuid;
alter table public.exercises      add column if not exists client_id uuid;
create unique index if not exists plans_client_id_key          on public.plans (client_id);
create unique index if not exists plan_days_client_id_key      on public.plan_days (client_id);
create unique index if not exists plan_exercises_client_id_key on public.plan_exercises (client_id);
create unique index if not exists exercises_client_id_key      on public.exercises (client_id);
