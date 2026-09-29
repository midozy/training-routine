// Run: node --experimental-strip-types scripts/test-offline.mjs
import assert from 'node:assert/strict';
import { runQuery } from '../lib/pgrest.ts';

const q = (rows, qs, accept = null) => runQuery(rows, new URLSearchParams(qs), accept);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

const sets = [
  { id: 1, session_id: 10, exercise_id: 5, set_number: 1, weight_kg: 80, reps: 12, logged_at: '2026-09-20T10:00:00+00:00' },
  { id: 2, session_id: 10, exercise_id: 5, set_number: 2, weight_kg: 82.5, reps: 10, logged_at: '2026-09-20T10:05:00+00:00' },
  { id: 3, session_id: 11, exercise_id: 6, set_number: 1, weight_kg: 60, reps: 8, logged_at: '2026-09-27T09:00:00+00:00' },
  { id: 4, session_id: 12, exercise_id: 5, set_number: 1, weight_kg: 85, reps: 8, logged_at: '2026-09-29T09:00:00+00:00' },
];

console.log('offline query engine');
t('Workout "last time" query: in + neq + order desc + limit + projection', () => {
  const r = q(sets, 'select=session_id,exercise_id,set_number,weight_kg,reps,logged_at&exercise_id=in.(5,6)&session_id=neq.12&order=logged_at.desc&limit=1000');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((x) => x.session_id), [11, 10, 10]);
  assert.deepEqual(Object.keys(r.body[0]), ['session_id', 'exercise_id', 'set_number', 'weight_kg', 'reps', 'logged_at']);
});
t('in.() with an empty list returns nothing', () => assert.deepEqual(q(sets, 'select=*&id=in.()').body, []));
t('select=* keeps every column; range paging (offset/limit)', () => {
  const r = q(sets, 'select=*&order=id.asc&limit=2&offset=1');
  assert.deepEqual(r.body.map((x) => x.id), [2, 3]);
  assert.ok('user_id' in { user_id: 1, ...r.body[0] } && 'weight_kg' in r.body[0]);
});
t('timestamp gte works across "Z" and "+00:00" formats', () => {
  const r = q(sets, 'select=id&logged_at=gte.2026-09-27T09:00:00.000Z');
  assert.deepEqual(r.body.map((x) => x.id), [3, 4]);
});
t('two filters on one column (gte + lte)', () => {
  assert.deepEqual(q(sets, 'select=id&logged_at=gte.2026-09-20T10:03:00.000Z&logged_at=lte.2026-09-27T23:00:00.000Z').body.map((x) => x.id), [2, 3]);
});
t('numeric eq matches numbers from the query string', () => assert.deepEqual(q(sets, 'select=id&session_id=eq.10').body.map((x) => x.id), [1, 2]));

const sessions = [
  { id: 1, finished_at: '2026-09-20T11:00:00+00:00', avg_hr: null, health_workout_id: null, started_at: '2026-09-20T10:00:00+00:00' },
  { id: 2, finished_at: null, avg_hr: 120, health_workout_id: 'x', started_at: '2026-09-27T10:00:00+00:00' },
  { id: 3, finished_at: '2026-09-28T11:00:00+00:00', avg_hr: null, health_workout_id: null, started_at: '2026-09-28T10:00:00+00:00' },
];
t('health sync query: not.is.null + is.null + gte + limit', () => {
  const r = q(sessions, 'select=id,started_at,finished_at&finished_at=not.is.null&avg_hr=is.null&started_at=gte.2026-08-01T00:00:00.000Z&limit=60');
  assert.deepEqual(r.body.map((x) => x.id), [1, 3]);
});
t('is.true / is.false / boolean eq', () => {
  const plans = [{ id: 1, archived: false, owner_id: null, slug: 'starter-ppl' }, { id: 2, archived: true, owner_id: 'u', slug: null }];
  assert.deepEqual(q(plans, 'select=id&archived=eq.false').body.map((x) => x.id), [1]);
  assert.deepEqual(q(plans, 'select=id&slug=eq.starter-ppl&owner_id=is.null').body.map((x) => x.id), [1]);
  assert.deepEqual(q(plans, 'select=id&archived=is.true').body.map((x) => x.id), [2]);
});
t('NULL ordering follows Postgres (asc: nulls last, desc: nulls first)', () => {
  const rows = [{ id: 1, v: 2 }, { id: 2, v: null }, { id: 3, v: 1 }];
  assert.deepEqual(q(rows, 'select=id&order=v.asc').body.map((x) => x.id), [3, 1, 2]);
  assert.deepEqual(q(rows, 'select=id&order=v.desc').body.map((x) => x.id), [2, 1, 3]);
  assert.deepEqual(q(rows, 'select=id&order=v.desc.nullslast').body.map((x) => x.id), [1, 3, 2]);
});
t('neq / comparisons never match NULL (SQL semantics)', () => {
  const rows = [{ id: 1, v: 1 }, { id: 2, v: null }];
  assert.deepEqual(q(rows, 'select=id&v=neq.5').body.map((x) => x.id), [1]);
  assert.deepEqual(q(rows, 'select=id&v=not.eq.5').body.map((x) => x.id), [1]);
});
t('.single(): exactly one row → object; otherwise 406 PGRST116', () => {
  const ok = q(sets, 'select=*&id=eq.3', 'application/vnd.pgrst.object+json');
  assert.equal(ok.status, 200); assert.equal(ok.body.id, 3);
  const none = q(sets, 'select=*&id=eq.99', 'application/vnd.pgrst.object+json');
  assert.equal(none.status, 406); assert.equal(none.body.code, 'PGRST116');
});
t('unsupported queries fail loudly, not silently wrong', () => {
  assert.equal(q(sets, 'select=*&or=(id.eq.1,id.eq.2)').status, 400);
  assert.equal(q(sets, 'select=*&id=wat.1').status, 400);
});
t('embedded selects return whole rows (not supported, but never crash)', () => assert.equal(q(sets, 'select=*,exercises(name)&id=eq.1').body.length, 1));
console.log(`\n${n} tests passed`);

// ---------- the fetch wrapper (mocked network) ----------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
mkdirSync('/tmp/heavy-test', { recursive: true });
for (const f of ['pgrest', 'pgwrite', 'store', 'outbox', 'offline']) {
  const src = readFileSync(new URL(`../lib/${f}.ts`, import.meta.url), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(`/tmp/heavy-test/${f}.ts`, src);
}
const off = await import(pathToFileURL('/tmp/heavy-test/offline.ts').href);
const realFetch = globalThis.fetch;
const netDown = () => { globalThis.fetch = async () => { throw new TypeError('Load failed'); }; };
const netUp = (status = 200, body = '[]') => { globalThis.fetch = async () => new Response(body, { status }); };
const BASE = 'https://x.supabase.co';
const read = async (res) => ({ status: res.status, body: await res.json() });

console.log('\noffline fetch wrapper');
const later = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

await off.kvSet('t:plans', [{ id: 1, name: 'Starter', archived: false }, { id: 2, name: 'Mine', archived: true }]);
await off.kvSet('t:set_logs', sets);

await later('no signal: a read is answered from the saved copy and the app is marked offline', async () => {
  netDown();
  const r = await read(await off.heavyFetch(`${BASE}/rest/v1/plans?select=*&archived=eq.false`, { headers: { Accept: 'application/json' } }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.map((x) => x.id), [1]);
  assert.equal(off.isOnline(), false);
});
await later('.single() read offline returns one object', async () => {
  const r = await read(await off.heavyFetch(`${BASE}/rest/v1/plans?select=*&id=eq.2`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }));
  assert.equal(r.body.name, 'Mine');
});
await later('a table that was never downloaded reports a clear offline error (not a fake empty list)', async () => {
  const r = await read(await off.heavyFetch(`${BASE}/rest/v1/bodyweight_logs?select=*`));
  assert.equal(r.status, 503); assert.equal(r.body.code, 'OFFLINE');
});
await later('a write with no signal is refused with a clear message (Phase 2 will queue it)', async () => {
  const r = await read(await off.heavyFetch(`${BASE}/rest/v1/set_logs`, { method: 'POST', body: '{}' }));
  assert.equal(r.status, 503); assert.match(r.body.message, /offline/i);
});
await later('sign-in style requests still fail normally offline (they are not emulated)', async () => {
  await assert.rejects(() => off.heavyFetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' }), TypeError);
});
await later('back online: requests go to the network and the app is marked online again', async () => {
  netUp(200, '[{"id":9}]');
  const r = await read(await off.heavyFetch(`${BASE}/rest/v1/plans?select=*`));
  assert.deepEqual(r.body, [{ id: 9 }]); assert.equal(off.isOnline(), true);
});
await later('a successful online write tells the sync engine which table changed', async () => {
  const seen = []; off.onRestWrite((t) => seen.push(t));
  netUp(201, '[]');
  await off.heavyFetch(`${BASE}/rest/v1/set_logs?on_conflict=x`, { method: 'POST', body: '{}' });
  await off.heavyFetch(`${BASE}/rest/v1/set_logs?select=*`);            // reads don't count
  await off.heavyFetch(`${BASE}/rest/v1/rpc/duplicate_plan`, { method: 'POST' }); // rpc isn't a table
  assert.deepEqual(seen, ['set_logs']);
});
await later('a request cancelled by the app is not mistaken for "offline"', async () => {
  off.setOnline(true);
  const ac = new AbortController(); ac.abort();
  globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(() => off.heavyFetch(`${BASE}/rest/v1/plans?select=*`, { signal: ac.signal }));
  assert.equal(off.isOnline(), true);
});
globalThis.fetch = realFetch;
console.log(`\n${n} tests passed`);

// ---------- the real Supabase client talking through the wrapper ----------
import { createClient } from '@supabase/supabase-js';
console.log('\nreal supabase-js client, network down');
const mkStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), _m: m }; };
const mk = (storage = mkStore()) => ({ storage, c: createClient(BASE, 'anon-key', { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage }, global: { fetch: off.heavyFetch } }) });

await off.kvSet('t:workout_sessions', sessions);
netDown();
{
  const { c } = mk();
  await later('select + eq returns rows and no error', async () => {
    const { data, error } = await c.from('plans').select('*').eq('archived', false);
    assert.equal(error, null); assert.deepEqual(data.map((x) => x.id), [1]);
  });
  await later('maybeSingle() returns one object; no match returns null', async () => {
    assert.equal((await c.from('plans').select('*').eq('id', 2).maybeSingle()).data.name, 'Mine');
    const none = await c.from('plans').select('*').eq('id', 99).maybeSingle();
    assert.equal(none.data, null); assert.equal(none.error, null);
  });
  await later('single() with no match gives the usual PGRST116 error', async () => {
    const { data, error } = await c.from('plans').select('*').eq('id', 99).single();
    assert.equal(data, null); assert.equal(error.code, 'PGRST116');
  });
  await later('in([]) → empty list; range(0, 999) → all rows; order + limit', async () => {
    assert.deepEqual((await c.from('set_logs').select('*').in('session_id', [])).data, []);
    assert.equal((await c.from('set_logs').select('*').order('id').range(0, 999)).data.length, 4);
    const top = await c.from('set_logs').select('weight_kg').order('logged_at', { ascending: false }).limit(1);
    assert.deepEqual(top.data, [{ weight_kg: 85 }]);
  });
  await later('not(..., "is", null) + is(..., null) + gte, as the health sync uses', async () => {
    const { data } = await c.from('workout_sessions').select('id, started_at, finished_at')
      .not('finished_at', 'is', null).is('avg_hr', null).gte('started_at', '2026-08-01T00:00:00.000Z').limit(60);
    assert.deepEqual(data.map((x) => x.id), [1, 3]);
  });
  await later('upsert offline returns a readable error (no crash, nothing pretends to save)', async () => {
    const { error } = await c.from('set_logs').upsert({ session_id: 1, set_number: 1 }, { onConflict: 'session_id,plan_exercise_id,set_number' });
    assert.match(error.message, /offline/i);
  });
  await later('the saved-login storage key matches what lib/session.ts reads', async () => {
    const real = createClient('https://danzdvismbezkymgstfu.supabase.co', 'k', { auth: { storage: mkStore() } }).auth.storageKey;
    assert.equal(real, `sb-${new URL('https://danzdvismbezkymgstfu.supabase.co').hostname.split('.')[0]}-auth-token`);
  });
  await later('EXPIRED login + no signal: getSession reports none, but the saved login stays on the phone', async () => {
    const st = mkStore();
    const { c: c2 } = mk(st);
    const key = c2.auth.storageKey;
    const expired = { access_token: 'a.b.c', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200, user: { id: 'user-1', email: 'me@x.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
    st.setItem(key, JSON.stringify(expired));
    const { data } = await c2.auth.getSession();
    assert.equal(data.session, null);                       // this is what used to bounce you to the login screen
    const kept = JSON.parse(st.getItem(key));                // ...but it must still be saved so we can fall back to it
    assert.equal(kept.user.id, 'user-1'); assert.equal(kept.refresh_token, 'r');
    assert.equal(off.isOnline(), false);                     // and the failed refresh flagged us offline (currentSession relies on this)
  });
}
globalThis.fetch = realFetch;
console.log(`\n${n} tests passed`);

// =====================================================================================================
// Phase 2: changes made on the phone, the outbox, and syncing (a fake Supabase server holds the "cloud")
// =====================================================================================================
const ob = await import(pathToFileURL('/tmp/heavy-test/outbox.ts').href);
const pw = await import(pathToFileURL('/tmp/heavy-test/pgwrite.ts').href);
const rest = await import(pathToFileURL('/tmp/heavy-test/pgrest.ts').href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nwrite engine (pgwrite)');
const ctx = { userId: 'u1', now: '2026-09-29T12:00:00.000Z', newId: (() => { let i = 0; return () => --i; })() };
const P = (qs) => new URLSearchParams(qs);
await later('insert: temp negative id, server defaults filled, time frozen into the queued body', async () => {
  const r = pw.applyWrite([], { table: 'set_logs', method: 'POST', params: P(''), body: { session_id: 5, exercise_id: 1, set_number: 1, reps: 8 }, prefer: 'return=representation', accept: null }, ctx);
  assert.equal(r.status, 201); assert.ok(r.rows[0].id < 0);
  assert.equal(r.rows[0].user_id, 'u1'); assert.equal(r.rows[0].weight_kg, 0);
  assert.equal(r.queuedBody.logged_at, ctx.now);                 // frozen: not "whenever we sync"
  assert.equal('user_id' in r.queuedBody, false);                // the server fills user_id itself
});
await later('upsert (merge): updates only the given columns and keeps the original logged_at', async () => {
  const start = pw.applyWrite([], { table: 'set_logs', method: 'POST', params: P(''), body: { session_id: 5, plan_exercise_id: 2, exercise_id: 1, set_number: 1, reps: 8, weight_kg: 60 }, prefer: 'return=minimal', accept: null }, ctx).rows;
  const later_ = { ...ctx, now: '2026-09-29T13:00:00.000Z' };
  const r = pw.applyWrite(start, { table: 'set_logs', method: 'POST', params: P('on_conflict=session_id,plan_exercise_id,set_number'), body: { session_id: 5, plan_exercise_id: 2, exercise_id: 1, set_number: 1, reps: 10, weight_kg: 62.5 }, prefer: 'resolution=merge-duplicates,return=minimal', accept: null }, later_);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].reps, 10); assert.equal(r.rows[0].weight_kg, 62.5);
  assert.equal(r.rows[0].logged_at, ctx.now);                    // unchanged, like the server
  assert.equal('logged_at' in r.queuedBody, false);
});
await later('a duplicate without merge is refused (409), and the table is left untouched', async () => {
  const start = pw.applyWrite([], { table: 'session_swaps', method: 'POST', params: P(''), body: { session_id: 5, plan_exercise_id: 2, exercise_id: 9 }, prefer: 'return=minimal', accept: null }, ctx).rows;
  const r = pw.applyWrite(start, { table: 'session_swaps', method: 'POST', params: P('on_conflict=session_id,plan_exercise_id'), body: { session_id: 5, plan_exercise_id: 2, exercise_id: 3 }, prefer: 'return=minimal', accept: null }, ctx);
  assert.equal(r.status, 409); assert.equal(r.rows, start);
});
await later('patch and delete use the same filters as reads', async () => {
  let rows = [{ id: 1, user_id: 'u1', finished_at: null }, { id: 2, user_id: 'u1', finished_at: null }];
  const p = pw.applyWrite(rows, { table: 'workout_sessions', method: 'PATCH', params: P('id=eq.2'), body: { finished_at: 'X' }, prefer: 'return=minimal', accept: null }, ctx);
  assert.deepEqual(p.rows.map((r) => r.finished_at), [null, 'X']); assert.equal(p.status, 204);
  const d = pw.applyWrite(p.rows, { table: 'workout_sessions', method: 'DELETE', params: P('id=eq.1'), body: null, prefer: null, accept: null }, ctx);
  assert.deepEqual(d.rows.map((r) => r.id), [2]);
});

// ---- the fake cloud ----
function makeServer() {
  const s = { db: { workout_sessions: [], set_logs: [], session_swaps: [], user_settings: [{ user_id: 'u1', active_plan_id: 1, next_position: 0, units: 'kg' }] }, log: [], now: '2030-01-01T00:00:00.000Z', latency: 0,
    mode: { down: false, writes503: false, loseNext: null, reject: null } };
  const seq = { workout_sessions: 99, set_logs: 999 };
  s.fetch = async (input, init = {}) => {
    const url = new URL(input.toString());
    const method = (init.method ?? 'GET').toUpperCase();
    if (s.mode.down) throw new TypeError('Load failed');
    if (s.latency) await sleep(s.latency);
    const table = url.pathname.split('/rest/v1/')[1];
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    s.log.push({ method, table, query: url.search.slice(1), body, prefer: headers.get('Prefer') });
    if (method === 'GET') { const r = rest.runQuery(s.db[table] ?? [], url.searchParams, headers.get('Accept')); return new Response(JSON.stringify(r.body), { status: r.status }); }
    if (s.mode.writes503) return new Response('{}', { status: 503 });
    if (s.mode.reject?.({ method, table, body })) return new Response(JSON.stringify({ message: 'new row violates check constraint' }), { status: 400 });
    const out = pw.applyWrite(s.db[table], { table, method, params: url.searchParams, body, prefer: headers.get('Prefer'), accept: headers.get('Accept') }, { userId: 'u1', now: s.now, newId: () => ++seq[table] });
    if (out.status >= 400) return new Response(JSON.stringify(out.body), { status: out.status });
    s.db[table] = out.rows;
    if (s.mode.loseNext === table + method) { s.mode.loseNext = null; throw new TypeError('Load failed'); } // applied, but the reply never arrives
    return out.body === null ? new Response(null, { status: out.status }) : new Response(JSON.stringify(out.body), { status: out.status });
  };
  return s;
}
let drained = [];
async function fresh() {
  const server = makeServer();
  await off.clearLocal();
  await off.kvSet('meta', { userId: 'u1', lastPull: 1 });
  for (const t of ['workout_sessions', 'set_logs', 'session_swaps']) await off.kvSet(`t:${t}`, []);
  await off.kvSet('t:user_settings', structuredClone(server.db.user_settings));
  await ob.initOutbox();
  drained = [];
  ob.configureOutbox({ url: BASE, key: 'k', getToken: async () => 'tok', onDrained: (t) => drained.push(...t) });
  globalThis.fetch = server.fetch;
  const c = createClient(BASE, 'k', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: off.heavyFetch } });
  return { server, c };
}
const settle = async () => { for (let i = 0; i < 400 && off.getState().pending > 0 && !off.getState().failed; i++) await sleep(5); await sleep(10); };
const pending = () => off.getState().pending;

// A whole workout, exactly as the Workout screen does it.
async function doWorkoutOffline(c) {
  const { data: s, error } = await c.from('workout_sessions').insert({ plan_day_id: 7, day_name: 'Push' }).select('id').single();
  assert.equal(error, null);
  const set = (n, w, r) => c.from('set_logs').upsert({ session_id: s.id, plan_exercise_id: 11, exercise_id: 3, set_number: n, weight_kg: w, reps: r }, { onConflict: 'session_id,plan_exercise_id,set_number' });
  for (const [n, w, r] of [[1, 80, 12], [2, 82.5, 10], [3, 82.5, 9]]) assert.equal((await set(n, w, r)).error, null);
  assert.equal((await set(2, 85, 8)).error, null);                                                     // edit an earlier set
  assert.equal((await c.from('set_logs').delete().match({ session_id: s.id, plan_exercise_id: 11, set_number: 3 })).error, null); // undo
  await c.from('session_swaps').upsert({ session_id: s.id, plan_exercise_id: 12, exercise_id: 40 }, { onConflict: 'session_id,plan_exercise_id' });
  await c.from('session_swaps').delete().match({ session_id: s.id, plan_exercise_id: 12 });
  await c.from('session_swaps').upsert({ session_id: s.id, plan_exercise_id: 12, exercise_id: 41 }, { onConflict: 'session_id,plan_exercise_id' });
  await c.from('workout_sessions').update({ finished_at: '2026-09-29T11:00:00.000Z', notes: null }).eq('id', s.id);
  await c.from('user_settings').update({ next_position: 1 }).eq('user_id', 'u1');
  return s.id;
}

console.log('\nfull workout with no signal, then sync');
{
  const { server, c } = await fresh();
  server.mode.down = true;
  const id = await doWorkoutOffline(c);
  await later('offline: every screen query already sees the workout (started, sets, edit, undo, swap, finish)', async () => {
    assert.ok(id < 0);
    const sets = (await c.from('set_logs').select('*').eq('session_id', id).order('set_number')).data;
    assert.deepEqual(sets.map((x) => [x.set_number, x.weight_kg, x.reps]), [[1, 80, 12], [2, 85, 8]]);
    assert.equal((await c.from('workout_sessions').select('*').eq('id', id).maybeSingle()).data.finished_at, '2026-09-29T11:00:00.000Z');
    assert.deepEqual((await c.from('session_swaps').select('plan_exercise_id, exercise_id').eq('session_id', id)).data, [{ plan_exercise_id: 12, exercise_id: 41 }]);
    assert.equal((await c.from('user_settings').select('*').maybeSingle()).data.next_position, 1);
  });
  await later('offline: 11 changes are waiting and nothing was sent', async () => {
    assert.equal(pending(), 11); assert.equal(server.log.length, 0); assert.equal(off.getState().online, false);
  });
  server.mode.down = false;
  const res = await ob.flush();
  await later('back online: everything is sent, in order, and the queue empties', async () => {
    assert.equal(res.blocked, null); assert.equal(pending(), 0);
    assert.equal(server.log[0].table, 'workout_sessions');
    assert.match(server.log[0].query, /on_conflict=client_id/);            // the workout is an idempotent upsert
    assert.equal(server.log.filter((r) => r.method !== 'GET').length, 11);
  });
  await later('the cloud has the right data: real ids, the times you actually did it, no negative ids', async () => {
    assert.equal(server.db.workout_sessions.length, 1);
    const ws = server.db.workout_sessions[0];
    assert.equal(ws.id, 100); assert.ok(ws.client_id); assert.equal(ws.day_name, 'Push'); assert.equal(ws.finished_at, '2026-09-29T11:00:00.000Z');
    assert.deepEqual(server.db.set_logs.map((x) => [x.session_id, x.set_number, x.weight_kg, x.reps]), [[100, 1, 80, 12], [100, 2, 85, 8]]);
    assert.ok(server.db.set_logs.every((x) => x.logged_at !== server.now && x.logged_at < '2030'));   // not stamped with sync time
    assert.ok(new Date(ws.started_at) < new Date());
    assert.deepEqual(server.db.session_swaps.map((x) => [x.session_id, x.exercise_id]), [[100, 41]]);
    assert.equal(server.db.user_settings[0].next_position, 1);
  });
  await later('the phone knows the real id, and old temporary ids still resolve (also in reads)', async () => {
    assert.equal(await ob.resolveSessionId(id), 100);
    const viaOld = (await c.from('set_logs').select('*').eq('session_id', id)).data;   // goes to the server with the id translated
    assert.equal(viaOld.length, 2);
    assert.deepEqual([...new Set(drained)].sort(), ['session_swaps', 'set_logs', 'user_settings', 'workout_sessions']);
    const mirror = await off.kvGet('t:set_logs'); assert.ok(mirror.every((r) => r.session_id === 100));
  });
}

console.log('\nsafety: things that must never lose or duplicate a workout');
{
  const { server, c } = await fresh();
  server.mode.down = true;
  const id = await doWorkoutOffline(c);
  server.mode.down = false; server.mode.loseNext = 'workout_sessionsPOST';   // the cloud saves it, but the reply is lost
  const first = await ob.flush();
  await later('a lost reply leaves the queue intact (nothing dropped)', async () => {
    assert.equal(first.blocked, 'offline'); assert.equal(pending(), 11); assert.equal(server.db.workout_sessions.length, 1);
  });
  const second = await ob.flush();
  await later('retrying after a lost reply does NOT create a second workout', async () => {
    assert.equal(second.blocked, null); assert.equal(pending(), 0);
    assert.equal(server.db.workout_sessions.length, 1); assert.equal(server.db.set_logs.length, 2);
    assert.ok(server.db.set_logs.every((x) => x.session_id === 100));
    assert.equal(await ob.resolveSessionId(id), 100);
  });
}
{
  const { server, c } = await fresh();
  server.mode.down = true;
  const id = await doWorkoutOffline(c);
  server.mode.down = false; server.mode.reject = ({ table, body }) => table === 'set_logs' && body.reps === 8; // the cloud refuses one set
  const r = await ob.flush();
  await later('a rejected change stops the queue, keeps everything else, and says why', async () => {
    assert.equal(r.blocked, 'failed'); assert.match(off.getState().failed, /400/);
    // sent before the refused edit: the workout + sets 1, 2, 3. Still waiting: the refused edit and the 6 changes after it.
    assert.equal(pending(), 7); assert.equal(server.db.workout_sessions.length, 1); assert.equal(server.db.set_logs.length, 3);
  });
  await later('after the problem is fixed, Retry sends the rest and nothing is lost', async () => {
    server.mode.reject = null; await ob.retryFailed();
    assert.equal(pending(), 0); assert.equal(off.getState().failed, null);
    assert.deepEqual(server.db.set_logs.map((x) => x.reps).sort((a, b) => a - b), [8, 12]); assert.equal(server.db.session_swaps.length, 1);
  });
}
{
  const { server, c } = await fresh();
  server.mode.down = true;
  const id = await doWorkoutOffline(c);
  server.mode.down = false; server.mode.reject = ({ table }) => table === 'workout_sessions';  // the workout itself is refused
  await ob.flush();
  await later('Discard removes the refused workout AND everything that belonged to it, on the phone and in the queue', async () => {
    assert.match(off.getState().failed, /400/);
    server.mode.reject = null;
    await ob.discardFailed();
    assert.equal(pending(), 0); assert.equal(off.getState().failed, null);
    assert.equal((await off.kvGet('t:workout_sessions')).length, 0); assert.equal((await off.kvGet('t:set_logs')).length, 0);
    assert.equal(server.db.workout_sessions.length, 0);
  });
}
{
  const { server, c } = await fresh();
  server.mode.writes503 = true;                                            // signal is fine for reading, the cloud is struggling with writes
  const { data: s } = await c.from('workout_sessions').insert({ plan_day_id: 7, day_name: 'Legs' }).select('id').single();
  await c.from('set_logs').upsert({ session_id: s.id, plan_exercise_id: 1, exercise_id: 1, set_number: 1, weight_kg: 100, reps: 5 }, { onConflict: 'session_id,plan_exercise_id,set_number' });
  await sleep(30);
  server.log.length = 0;
  await later('while changes are waiting, screens read from the phone (they include your not-yet-sent changes)', async () => {
    const rows = (await c.from('set_logs').select('*').eq('session_id', s.id)).data;
    assert.equal(rows.length, 1); assert.equal(rows[0].weight_kg, 100);
    assert.equal(server.log.filter((r) => r.method === 'GET').length, 0);
  });
  await later('a temporary server error (503) never marks a change as failed; it is simply retried', async () => {
    assert.equal(off.getState().failed, null); assert.equal(pending(), 2);
    server.mode.writes503 = false; await ob.flush(); assert.equal(pending(), 0); assert.equal(server.db.set_logs.length, 1);
  });
}
{
  const { server, c } = await fresh();
  server.latency = 8; server.mode.down = false;
  const { data: s } = await c.from('workout_sessions').insert({ plan_day_id: 7, day_name: 'Pull' }).select('id').single();
  const set = (n) => c.from('set_logs').upsert({ session_id: s.id, plan_exercise_id: 1, exercise_id: 1, set_number: n, weight_kg: 50, reps: 10 }, { onConflict: 'session_id,plan_exercise_id,set_number' });
  await set(1); await sleep(12);
  await set(2); await set(3);                                              // logged while a sync is already running
  await settle();
  await later('sets logged while a sync is running are not missed', async () => {
    assert.equal(pending(), 0); assert.deepEqual(server.db.set_logs.map((x) => x.set_number), [1, 2, 3]);
    assert.ok(server.db.set_logs.every((x) => x.session_id === 100));
  });
}
{
  const { server, c } = await fresh();
  server.mode.down = true;
  await doWorkoutOffline(c);
  await later('signing out wipes unsent changes too (the app warns before this)', async () => {
    assert.equal(pending(), 11); await off.clearLocal();
    assert.equal(pending(), 0); assert.equal(await ob.pendingCount(), 0); assert.equal(await off.kvGet('outbox'), undefined);
  });
}
globalThis.fetch = realFetch;
console.log(`\n${n} tests passed`);
