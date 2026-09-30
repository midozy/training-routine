// The database's foreign-key rules, reproduced for the copy saved on the phone (so deleting a plan offline removes its
// days and exercises there too, exactly as the server will when the change syncs). Erasable TypeScript only.
import type { Row } from './pgrest';

export type Ref = { table: string; col: string; parent: string; onDelete: 'cascade' | 'null' | 'restrict' };

export const REFS: Ref[] = [
  { table: 'plan_days', col: 'plan_id', parent: 'plans', onDelete: 'cascade' },
  { table: 'plan_exercises', col: 'plan_day_id', parent: 'plan_days', onDelete: 'cascade' },
  { table: 'plan_exercises', col: 'exercise_id', parent: 'exercises', onDelete: 'restrict' },
  { table: 'plans', col: 'source_plan_id', parent: 'plans', onDelete: 'null' },
  { table: 'session_swaps', col: 'exercise_id', parent: 'exercises', onDelete: 'restrict' },
  { table: 'session_swaps', col: 'plan_exercise_id', parent: 'plan_exercises', onDelete: 'cascade' },
  { table: 'session_swaps', col: 'session_id', parent: 'workout_sessions', onDelete: 'cascade' },
  { table: 'set_logs', col: 'exercise_id', parent: 'exercises', onDelete: 'restrict' },
  { table: 'set_logs', col: 'plan_exercise_id', parent: 'plan_exercises', onDelete: 'null' },
  { table: 'set_logs', col: 'session_id', parent: 'workout_sessions', onDelete: 'cascade' },
  { table: 'user_settings', col: 'active_plan_id', parent: 'plans', onDelete: 'null' },
  { table: 'workout_sessions', col: 'plan_day_id', parent: 'plan_days', onDelete: 'null' },
];

/** column name -> the table it points at (column names are unambiguous across Heavy's tables) */
export const FK_PARENT: Record<string, string> = Object.fromEntries(REFS.map((r) => [r.col, r.parent]));

/** Tables whose rows can be created offline: they have a client_id column and get temporary (negative) ids. */
export const ID_TABLES = new Set(['workout_sessions', 'plans', 'plan_days', 'plan_exercises', 'exercises']);

/** Every table the rules above touch. */
export const CASCADE_TABLES = [...new Set(REFS.flatMap((r) => [r.table, r.parent]))];

/**
 * Apply ON DELETE rules after rows were removed from `table`. `db` must hold private copies of the tables
 * (rows are changed in place). Returns the names of the tables that changed.
 */
export function cascade(db: Record<string, Row[]>, table: string, removed: Row[]): Set<string> {
  const changed = new Set<string>();
  const queue: Array<{ table: string; ids: Set<unknown> }> = [{ table, ids: new Set(removed.map((r) => r.id)) }];
  while (queue.length) {
    const { table: t, ids } = queue.shift()!;
    for (const ref of REFS) {
      if (ref.parent !== t || ref.onDelete === 'restrict') continue;
      const rows = db[ref.table];
      if (!rows) continue;
      const hit = rows.filter((r) => r[ref.col] != null && ids.has(r[ref.col]));
      if (!hit.length) continue;
      changed.add(ref.table);
      if (ref.onDelete === 'cascade') {
        const gone = new Set(hit);
        db[ref.table] = rows.filter((r) => !gone.has(r));
        queue.push({ table: ref.table, ids: new Set(hit.map((r) => r.id)) });
      } else {
        for (const r of hit) r[ref.col] = null;
      }
    }
  }
  return changed;
}

/**
 * Remove everything that depends on rows that will never exist (created offline, then refused by the server and
 * discarded). `dead` holds "table:temporaryId" entries and grows as dependents are removed. Returns changed tables.
 */
export function purgeDead(db: Record<string, Row[]>, dead: Set<string>): Set<string> {
  const changed = new Set<string>();
  let again = true;
  while (again) {
    again = false;
    for (const t of Object.keys(db)) {
      const rows = db[t];
      const keep: Row[] = [];
      for (const r of rows) {
        let drop = ID_TABLES.has(t) && dead.has(`${t}:${r.id}`);
        if (!drop) {
          for (const ref of REFS) {
            if (ref.table !== t) continue;
            const v = r[ref.col];
            if (typeof v === 'number' && dead.has(`${ref.parent}:${v}`)) {
              if (ref.onDelete === 'null') { r[ref.col] = null; changed.add(t); } else { drop = true; break; }
            }
          }
        }
        if (drop) {
          if (ID_TABLES.has(t)) dead.add(`${t}:${r.id}`);
          again = true; changed.add(t);
        } else keep.push(r);
      }
      if (keep.length !== rows.length) db[t] = keep;
    }
  }
  return changed;
}
