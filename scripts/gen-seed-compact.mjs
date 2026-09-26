import { plans } from '../data/plans.mjs';
const compact = plans.map(p => ({ s: p.slug, n: p.name, d: p.description, days: p.days.map(d => ({ n: d.name, r: !!d.rest, x: d.exercises.map(e => [e.name, e.muscle, e.target, e.unit, e.cue, e.rest ?? 90]) })) }));
const json = JSON.stringify(compact).replace(/'/g, "''");
console.log(`with j as (select '${json}'::jsonb as j),
p as (select p.value as p from j, jsonb_array_elements(j.j) p),
d as (select p->>'s' as slug, d.ordinality - 1 as pos, d.value as d from p, jsonb_array_elements(p->'days') with ordinality d),
x as (select slug, pos, e.ordinality - 1 as epos, e.value as e from d, jsonb_array_elements(d->'x') with ordinality e),
ins_ex as (insert into public.exercises (name, muscle) select distinct on (regexp_replace(e->>0, ' \\(2nd round\\)$', '')) regexp_replace(e->>0, ' \\(2nd round\\)$', ''), e->>1 from x returning id, name),
ins_p as (insert into public.plans (slug, name, description) select p->>'s', p->>'n', p->>'d' from p returning id, slug),
ins_d as (insert into public.plan_days (plan_id, position, name, is_rest) select ins_p.id, d.pos, d.d->>'n', (d.d->>'r')::boolean from d join ins_p using (slug) returning id, plan_id, position)
insert into public.plan_exercises (plan_day_id, position, exercise_id, label, target_reps, unit, cue, rest_seconds)
select ins_d.id, x.epos, ins_ex.id, x.e->>0, array(select jsonb_array_elements_text(x.e->2)::int), x.e->>3, x.e->>4, (x.e->>5)::int
from x join ins_p using (slug) join ins_d on ins_d.plan_id = ins_p.id and ins_d.position = x.pos
join ins_ex on ins_ex.name = regexp_replace(x.e->>0, ' \\(2nd round\\)$', '');`);
