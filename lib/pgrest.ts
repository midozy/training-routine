// Answers PostgREST GET queries from rows saved on the phone, so screens keep working offline.
// Supports exactly what Heavy's screens use: select projection, eq/neq/gt/gte/lt/lte/is/in/like/ilike (+ not.),
// order, limit/offset, and the single-object Accept header. Anything else fails loudly instead of returning wrong data.
// NOTE: keep this file erasable-TypeScript only (no enums / parameter properties) so scripts/test-offline.mjs can run it.

export type Row = Record<string, unknown>;
export type Result = { status: number; body: unknown };

type Filter = { col: string; op: string; val: string; neg: boolean };
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is', 'in', 'like', 'ilike']);
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

const isTs = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s);

function parseFilter(col: string, raw: string): Filter | null {
  let neg = false;
  let rest = raw;
  if (rest.startsWith('not.')) { neg = true; rest = rest.slice(4); }
  const dot = rest.indexOf('.');
  if (dot < 0) return null;
  const op = rest.slice(0, dot);
  if (!OPS.has(op)) return null;
  return { col, op, val: rest.slice(dot + 1), neg };
}

/** "(1,2,3)" or ("a b","c") → values */
function listVals(v: string): string[] {
  const inner = v.startsWith('(') && v.endsWith(')') ? v.slice(1, -1) : v;
  if (inner === '') return [];
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of inner) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Compare a stored (typed) value with a query-string value. */
function cmpToStr(a: unknown, b: string): number {
  if (typeof a === 'number') return a - Number(b);
  if (typeof a === 'boolean') return Number(a) - Number(b === 'true');
  if (isTs(a) && isTs(b)) return Date.parse(a) - Date.parse(b);
  const s = String(a);
  return s < b ? -1 : s > b ? 1 : 0;
}

export function cmpVals(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (isTs(a) && isTs(b)) return Date.parse(a) - Date.parse(b);
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function likeToRegex(pattern: string, ci: boolean): RegExp {
  const esc = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/[*%]/g, '.*');
  return new RegExp(`^${esc}$`, ci ? 'i' : '');
}

function test(row: Row, f: Filter): boolean {
  const v = row[f.col];
  if (f.op === 'is') {
    const r = f.val === 'null' ? v == null : v === (f.val === 'true');
    return f.neg ? !r : r;
  }
  if (v == null) return false; // SQL: comparing NULL is never true (and NOT of it is not true either)
  let r: boolean;
  switch (f.op) {
    case 'eq': r = cmpToStr(v, f.val) === 0; break;
    case 'neq': r = cmpToStr(v, f.val) !== 0; break;
    case 'gt': r = cmpToStr(v, f.val) > 0; break;
    case 'gte': r = cmpToStr(v, f.val) >= 0; break;
    case 'lt': r = cmpToStr(v, f.val) < 0; break;
    case 'lte': r = cmpToStr(v, f.val) <= 0; break;
    case 'in': r = listVals(f.val).some((x) => cmpToStr(v, x) === 0); break;
    case 'like': r = likeToRegex(f.val, false).test(String(v)); break;
    case 'ilike': r = likeToRegex(f.val, true).test(String(v)); break;
    default: r = false;
  }
  return f.neg ? !r : r;
}

export function project(row: Row, select: string | null): Row {
  if (!select || select === '*' || /[():]/.test(select)) return row;
  const cols = select.split(',').map((s) => s.trim()).filter(Boolean);
  if (cols.includes('*')) return row;
  const out: Row = {};
  for (const c of cols) out[c] = row[c] ?? null;
  return out;
}

const unsupported = (why: string): Result => ({ status: 400, body: { code: 'OFFLINE_UNSUPPORTED', message: `This query can't be answered offline (${why}).` } });

/** Rows matching every filter in the query string, or null if a filter isn't supported offline. */
export function applyFilters(rows: Row[], params: URLSearchParams): Row[] | null {
  const filters: Filter[] = [];
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and') return null;
    const f = parseFilter(k, v);
    if (!f) return null;
    filters.push(f);
  }
  return rows.filter((r) => filters.every((f) => test(r, f)));
}

export function runQuery(rows: Row[], params: URLSearchParams, accept: string | null): Result {
  const filtered = applyFilters(rows, params);
  if (!filtered) return unsupported('filter');
  let out = filtered;

  const order = params.get('order');
  if (order) {
    const specs = order.split(',').map((p) => {
      const [col, ...mods] = p.split('.');
      const desc = mods.includes('desc');
      const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc; // Postgres: NULLs are "largest"
      return { col, desc, nullsFirst };
    });
    out = [...out].sort((a, b) => {
      for (const s of specs) {
        const x = a[s.col];
        const y = b[s.col];
        if (x == null && y == null) continue;
        if (x == null) return s.nullsFirst ? -1 : 1;
        if (y == null) return s.nullsFirst ? 1 : -1;
        const c = cmpVals(x, y);
        if (c !== 0) return s.desc ? -c : c;
      }
      return 0;
    });
  }

  const offset = Number(params.get('offset') ?? 0) || 0;
  const limitRaw = params.get('limit');
  const limit = limitRaw == null ? undefined : Number(limitRaw);
  out = out.slice(offset, limit == null ? undefined : offset + limit);

  const projected = out.map((r) => project(r, params.get('select')));

  if (accept && accept.includes('application/vnd.pgrst.object+json')) {
    if (projected.length !== 1) {
      return { status: 406, body: { code: 'PGRST116', details: `The result contains ${projected.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { status: 200, body: projected[0] };
  }
  return { status: 200, body: projected };
}
