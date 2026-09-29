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
writeFileSync('/tmp/heavy-test/pgrest.ts', readFileSync(new URL('../lib/pgrest.ts', import.meta.url)));
writeFileSync('/tmp/heavy-test/offline.ts', readFileSync(new URL('../lib/offline.ts', import.meta.url), 'utf8').replace("'./pgrest'", "'./pgrest.ts'"));
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
