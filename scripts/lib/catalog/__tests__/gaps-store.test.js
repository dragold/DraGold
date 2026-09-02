import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertGaps, resolveGapsNotIn, gapKey } from '../gaps-store.js';

// Fake client minimale: registra le chiamate e restituisce risposte configurate.
function makeFake({ selectData = [] } = {}) {
  const calls = [];
  const api = {
    from(table) {
      const ctx = { table, filters: [], _op: null, _payload: null, _opts: null };
      const chain = {
        upsert(rows, opts) { ctx._op = 'upsert'; ctx._payload = rows; ctx._opts = opts; calls.push(ctx); return Promise.resolve({ error: null }); },
        update(payload) { ctx._op = 'update'; ctx._payload = payload; return chain; },
        select(cols) { ctx._op = ctx._op || 'select'; ctx._cols = cols; return chain; },
        eq(c, v) { ctx.filters.push(['eq', c, v]); return chain; },
        in(c, v) { ctx.filters.push(['in', c, v]); if (ctx._op === 'update') { calls.push(ctx); return Promise.resolve({ error: null }); } return chain; },
        lt() { return chain; },
        order() { return chain; },
        limit() { calls.push(ctx); return Promise.resolve({ data: selectData, error: null }); },
        single() { calls.push(ctx); return Promise.resolve({ data: selectData[0] || null, error: null }); },
        then(res) { calls.push(ctx); return Promise.resolve({ data: selectData, error: null }).then(res); },
      };
      return chain;
    },
  };
  return { api, calls };
}

test('upsertGaps: il payload NON contiene status/retry_count/resolved_at/first_seen_at', async () => {
  const { api, calls } = makeFake();
  await upsertGaps(api, [{
    tcg: 'onepiece', language: 'en', entity_type: 'set', source: 'tcgcsv', source_id: 'OP-17',
    set_code: 'OP-17', name: 'X', release_date: '2026-08-28',
  }]);
  const upsertCall = calls.find((c) => c._op === 'upsert');
  assert.ok(upsertCall, 'upsert eseguito');
  const row = upsertCall._payload[0];
  assert.equal(row.status, undefined);
  assert.equal(row.retry_count, undefined);
  assert.equal(row.resolved_at, undefined);
  assert.equal(row.first_seen_at, undefined);
  assert.ok(row.last_seen_at, 'last_seen_at presente');
  assert.equal(upsertCall._opts.onConflict, 'tcg,language,entity_type,source,source_id');
});

test('upsertGaps: [] -> nessuna chiamata', async () => {
  const { api, calls } = makeFake();
  const r = await upsertGaps(api, []);
  assert.equal(r.upserted, 0);
  assert.equal(calls.length, 0);
});

test('resolveGapsNotIn: chiude i gap la cui source_id non e\' fra le liveKeys', async () => {
  const { api, calls } = makeFake({ selectData: [
    { id: 'a', source_id: 'OP-17' },
    { id: 'b', source_id: 'OP-99' },
  ] });
  const r = await resolveGapsNotIn(api, { tcg: 'onepiece', language: 'en' }, new Set(['OP-17']));
  assert.equal(r.resolved, 1);
  const updateCall = calls.find((c) => c._op === 'update');
  assert.equal(updateCall._payload.status, 'resolved');
  assert.deepEqual(updateCall.filters.find((f) => f[0] === 'in'), ['in', 'id', ['b']]);
});

test('gapKey: stabile e collision-safe (separatore US 0x1F)', () => {
  const SEP = String.fromCharCode(0x1f);
  assert.equal(
    gapKey({ tcg: 'onepiece', language: 'en', entity_type: 'set', source: 'tcgcsv', source_id: 'OP-17' }),
    ['onepiece', 'en', 'set', 'tcgcsv', 'OP-17'].join(SEP),
  );
  // "a-bc" vs "ab-c" non collidono
  assert.notEqual(
    gapKey({ tcg: 'a', language: 'bc', entity_type: 'x', source: 'y', source_id: 'z' }),
    gapKey({ tcg: 'ab', language: 'c', entity_type: 'x', source: 'y', source_id: 'z' }),
  );
});
