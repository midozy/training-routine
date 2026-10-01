-- Applied to project danzdvismbezkymgstfu on 2026-09-30 (migration name: plan_exercises_superset_group).
-- Supersets: exercises in the same plan day with the same non-null superset_group, next to each other, are done as a superset
-- (A1, B1, rest, A2, B2, rest ...). NULL = a normal exercise. Group numbers only mean something within one day.
alter table public.plan_exercises add column if not exists superset_group smallint;

-- Duplicate / Reset must carry the grouping across.
create or replace function public.copy_plan_contents(src bigint, dst bigint)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare d record; nd bigint;
begin
  delete from public.plan_days where plan_id = dst;
  for d in select * from public.plan_days where plan_id = src order by position loop
    insert into public.plan_days (plan_id, position, name, is_rest) values (dst, d.position, d.name, d.is_rest) returning id into nd;
    insert into public.plan_exercises (plan_day_id, position, exercise_id, label, target_reps, unit, cue, rest_seconds, superset_group)
      select nd, position, exercise_id, label, target_reps, unit, cue, rest_seconds, superset_group from public.plan_exercises where plan_day_id = d.id;
  end loop;
end $function$;
