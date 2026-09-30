-- Applied to project danzdvismbezkymgstfu on 2026-09-30 (migration name: set_logs_rpe_note_warmup).
-- Training features: effort (RPE 1-10), a note per set, and warm-up sets (logged, but excluded from volume, PRs and charts).
-- Warm-up rows use set_number 101, 102, ... so they never collide with working sets 1, 2, 3 (unique on session, plan exercise, set number).
alter table public.set_logs add column if not exists is_warmup boolean not null default false;
alter table public.set_logs add column if not exists rpe numeric(3,1) check (rpe is null or (rpe >= 1 and rpe <= 10));
alter table public.set_logs add column if not exists note text;
