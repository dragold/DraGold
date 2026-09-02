import { describe, it, expect, vi } from 'vitest';

// Fake Supabase query builder: every chain method returns `this`, the object
// itself is thenable so `await builder` / `await builder.abortSignal(x)`
// resolves via `resolver(table, filters)`. Enough to exercise search.js's
// real control flow (which token produced which filter, abortSignal wiring,
// parallel-expand merging) without a network call.
function makeFakeSupabase(resolver) {
  function builder(table) {
    const filters = { table };
    const b = {
      select() { return b; },
      or() { return b; },
      eq(col, val) { filters[col] = val; return b; },
      in(col, vals) { filters[col] = vals; return b; },
      limit() { return b; },
      abortSignal(signal) { filters._signal = signal; return b; },
      then(resolve, reject) {
        return Promise.resolve(resolver(filters)).then(resolve, reject);
      },
    };
    return b;
  }
  return { from: (table) => builder(table) };
}

describe('searchCards — abortSignal propagation', () => {
  it('forwards the given AbortSignal to the base query', async () => {
    let seenSignal = null;
    vi.doMock('../supabase.js', () => ({
      supabase: makeFakeSupabase((filters) => {
        seenSignal = filters._signal;
        return { data: [], error: null };
      }),
      supabaseReady: true,
    }));
    const { searchCards } = await import('./search.js');
    const controller = new AbortController();
    await searchCards('pikachu', { signal: controller.signal });
    expect(seenSignal).toBe(controller.signal);
    vi.doUnmock('../supabase.js');
    vi.resetModules();
  });
});

describe('searchCards — parallel card-number expand merges correctly', () => {
  it('merges results from multiple TCGs found in the base query without duplicates', async () => {
    // Base query ("op05" looks like a set/card code) returns two cards from two
    // different TCGs sharing overlapping card_number strings — the exact
    // scenario the card_number expand is designed to avoid colliding.
    const baseRows = [
      { id: 'pkm-1', tcg: 'pokemon', card_number: 'OP05-001', name: 'Alpha', lang: 'en' },
      { id: 'op-1', tcg: 'onepiece', card_number: 'OP05-001', name: 'Beta', lang: 'en' },
    ];
    const expandByTcg = {
      pokemon: [{ id: 'pkm-1', tcg: 'pokemon', card_number: 'OP05-001', name: 'Alpha', lang: 'en' },
                { id: 'pkm-2', tcg: 'pokemon', card_number: 'OP05-001', name: 'Alpha JA', lang: 'ja' }],
      onepiece: [{ id: 'op-1', tcg: 'onepiece', card_number: 'OP05-001', name: 'Beta', lang: 'en' }],
    };
    let baseCalls = 0;
    vi.doMock('../supabase.js', () => ({
      supabase: makeFakeSupabase((filters) => {
        if (filters.tcg) {
          return { data: expandByTcg[filters.tcg] || [], error: null };
        }
        baseCalls++;
        return { data: baseRows, error: null };
      }),
      supabaseReady: true,
    }));
    const { searchCards } = await import('./search.js');
    const cards = await searchCards('op05001');
    expect(baseCalls).toBe(1);
    const ids = cards.map((c) => c.id).sort();
    // pkm-2 (JA variant, same canonical set/number) must be pulled in by the
    // expand and deduped against the base row already present (pkm-1).
    expect(ids).toEqual(['op-1', 'pkm-1', 'pkm-2']);
    vi.doUnmock('../supabase.js');
    vi.resetModules();
  });
});
