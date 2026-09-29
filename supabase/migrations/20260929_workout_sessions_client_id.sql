-- Applied to project danzdvismbezkymgstfu on 2026-09-29 (migration name: workout_sessions_client_id).
-- Offline Phase 2: a workout started offline has no server id yet. The phone generates this UUID so a retried
-- sync upserts the same workout instead of creating a duplicate. Existing rows keep NULL (NULLs never conflict).
alter table public.workout_sessions add column if not exists client_id uuid;
create unique index if not exists workout_sessions_client_id_key on public.workout_sessions (client_id);
