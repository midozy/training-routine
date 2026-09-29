-- Applied to project danzdvismbezkymgstfu on 2026-09-29 (migration name: starter_plan_exercise_library_week_start).

-- 1. Week start setting (0 = Sunday, 1 = Monday, 6 = Saturday). New accounts default to Monday; the existing account keeps Saturday weeks.
alter table public.user_settings add column if not exists week_start smallint not null default 1;
alter table public.user_settings drop constraint if exists user_settings_week_start_check;
alter table public.user_settings add constraint user_settings_week_start_check check (week_start in (0, 1, 6));
update public.user_settings set week_start = 6;

-- 2. Shared exercise library expansion (no instruction cards yet; cards come later).
insert into public.exercises (name, muscle, owner_id)
select v.name, v.muscle, null from (values
 ('Dumbbell Bench Press','Chest'),('Incline Barbell Bench Press','Chest'),('Decline Barbell Bench Press','Chest'),('Decline Dumbbell Press','Chest'),
 ('Machine Chest Press','Chest'),('Smith Machine Bench Press','Chest'),('High-to-Low Cable Crossover','Chest'),('Low-to-High Cable Fly','Chest'),
 ('Dumbbell Flyes','Chest'),('Incline Dumbbell Flyes','Chest'),('Pec Deck','Chest'),('Push-Ups','Chest'),('Weighted Push-Ups','Chest'),
 ('Landmine Press','Chest'),('Machine Dip','Chest'),
 ('Pull-Ups','Back'),('Chin-Ups','Back'),('Assisted Pull-Up','Back'),('Wide-Grip Lat Pulldown','Back'),('Close-Grip Lat Pulldown','Back'),
 ('Straight-Arm Pulldown','Back'),('Chest-Supported Row','Back'),('Machine Row','Back'),('Meadows Row','Back'),('Pendlay Row','Back'),
 ('Inverted Row','Back'),('Single-Arm Cable Row','Back'),('Deadlift','Back'),('Rack Pull','Back'),('Back Extension','Back'),('Good Morning','Back'),
 ('Arnold Press','Shoulders'),('Machine Shoulder Press','Shoulders'),('Push Press','Shoulders'),('Cable Lateral Raise','Shoulders'),
 ('Machine Lateral Raise','Shoulders'),('Front Raise','Shoulders'),
 ('Face Pull','Rear Delts'),('Cable Rear Delt Fly','Rear Delts'),
 ('Cable Shrug','Traps'),('Farmer''s Carry','Traps'),
 ('Dumbbell Curl','Biceps'),('Incline Dumbbell Curl','Biceps'),('EZ-Bar Curl','Biceps'),('EZ-Bar Preacher Curl','Biceps'),('Cable Curl','Biceps'),
 ('Spider Curl','Biceps'),('Bayesian Cable Curl','Biceps'),('Cross-Body Hammer Curl','Biceps'),('Rope Hammer Curl','Biceps'),
 ('Reverse Curl','Biceps'),('Zottman Curl','Biceps'),
 ('Close-Grip Bench Press','Triceps'),('Straight-Bar Pushdown','Triceps'),('V-Bar Pushdown','Triceps'),('Single-Arm Cable Pushdown','Triceps'),
 ('Overhead Cable Triceps Extension','Triceps'),('Bench Dips','Triceps'),('Diamond Push-Ups','Triceps'),('JM Press','Triceps'),
 ('Machine Triceps Extension','Triceps'),
 ('Front Squat','Quads'),('Bulgarian Split Squat','Quads'),('Reverse Lunge','Quads'),('Step-Up','Quads'),('Smith Machine Squat','Quads'),
 ('Sissy Squat','Quads'),('Pendulum Squat','Quads'),('Sumo Squat','Quads'),
 ('Romanian Deadlift','Hamstrings'),('Lying Leg Curl','Hamstrings'),('Seated Leg Curl','Hamstrings'),('Nordic Curl','Hamstrings'),
 ('Single-Leg Romanian Deadlift','Hamstrings'),('Glute-Ham Raise','Hamstrings'),
 ('Hip Thrust','Glutes'),('Barbell Glute Bridge','Glutes'),('Cable Kickback','Glutes'),('Cable Pull-Through','Glutes'),
 ('Hip Abduction Machine','Glutes'),('Sumo Deadlift','Glutes'),
 ('Leg Press Calf Raise','Calves'),('Donkey Calf Raise','Calves'),('Single-Leg Calf Raise','Calves'),
 ('Crunch','Abs'),('Cable Crunch','Abs'),('Machine Crunch','Abs'),('Hanging Leg Raise','Abs'),('Hanging Knee Raise','Abs'),('Ab Wheel Rollout','Abs'),
 ('Plank','Abs'),('Side Plank','Abs'),('Russian Twist','Abs'),('Decline Sit-Up','Abs'),('Pallof Press','Abs'),
 ('Kettlebell Swing','Other')
) as v(name, muscle)
on conflict (name) where owner_id is null do nothing;

-- 3. Shared starter plan: Push / Pull / Legs (owner_id null = visible to every user, read-only; users Duplicate it to edit).
with p as (
  insert into public.plans (slug, name, description, owner_id)
  select 'starter-ppl', 'Starter: Push / Pull / Legs', '3 training days + 1 rest, rotating', null
  where not exists (select 1 from public.plans where slug = 'starter-ppl' and owner_id is null)
  returning id
), d as (
  insert into public.plan_days (plan_id, position, name, is_rest)
  select p.id, v.pos, v.name, v.rest from p,
    (values (0,'Push',false),(1,'Pull',false),(2,'Legs',false),(3,'Rest',true)) as v(pos, name, rest)
  returning id, position
)
insert into public.plan_exercises (plan_day_id, position, exercise_id, label, target_reps, unit, cue, rest_seconds)
select d.id, x.pos, e.id, x.name, x.reps, 'reps', null, x.rest
from d
join (values
 (0,0,'Barbell Bench Press',array[8,8,8],120),
 (0,1,'Standing Military Press',array[8,8,8],90),
 (0,2,'Incline Dumbbell Press',array[10,10,10],90),
 (0,3,'Lateral Raises',array[15,15,15],90),
 (0,4,'Rope Pushdown',array[12,12,12],90),
 (0,5,'Overhead Dumbbell Extension',array[12,12],90),
 (1,0,'Lat Pulldown',array[10,10,10],120),
 (1,1,'Barbell Bent-Over Row',array[8,8,8],90),
 (1,2,'Seated Cable Row',array[10,10,10],90),
 (1,3,'Reverse Pec Deck',array[15,15,15],90),
 (1,4,'Barbell Curl',array[10,10,10],90),
 (1,5,'Hammer Curl',array[12,12],90),
 (2,0,'Barbell Squat',array[8,8,8],120),
 (2,1,'Stiff-Leg Deadlift',array[10,10,10],90),
 (2,2,'Leg Press',array[12,12,12],90),
 (2,3,'Leg Curl',array[12,12,12],90),
 (2,4,'Leg Extension',array[15,15],90),
 (2,5,'Standing Calf Raise',array[15,15,15],90)
) as x(day_pos, pos, name, reps, rest) on x.day_pos = d.position
join public.exercises e on e.name = x.name and e.owner_id is null;

-- 4. Follow-up (applied separately the same day): Landmine Press belongs with Shoulders, matching its instruction card.
update public.exercises set muscle = 'Shoulders' where name = 'Landmine Press' and owner_id is null;
