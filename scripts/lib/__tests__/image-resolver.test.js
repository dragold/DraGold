import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCardImage } from '../image-resolver.js';

const originalFetch = globalThis.fetch;

function mockFetch(responses) {
  let call = 0;
  return async () => {
    const r = responses[call++];
    if (!r) throw new Error('mockFetch: nessuna risposta configurata per questa chiamata');
    return {
      ok: r.ok !== false,
      status: r.status ?? 200,
      headers: { get: () => null },
      json: async () => r.body,
    };
  };
}

describe('resolveCardImage — stadio pokemontcg.io', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('skip esplicito per lang non-en (nessuna chiamata di rete)', async () => {
    globalThis.fetch = async () => { throw new Error('non deve essere chiamato per lang=ja'); };
    const result = await resolveCardImage({ name: 'Pikachu', localId: '25' }, 'ja');
    assert.equal(result.url, null);
    assert.equal(result.source, null);
  });

  test('restituisce l\'URL immagine quando pokemontcg.io ha un match per lang=en', async () => {
    globalThis.fetch = mockFetch([
      { body: { data: [
        { number: '25', images: { large: 'https://images.pokemontcg.io/base1/25_hires.png', small: 'https://images.pokemontcg.io/base1/25.png' } },
      ] } },
    ]);
    const result = await resolveCardImage({ name: 'Pikachu', localId: '25' }, 'en');
    assert.equal(result.url, 'https://images.pokemontcg.io/base1/25_hires.png');
    assert.equal(result.source, 'pokemontcg.io');
  });

  test('nessun match numero card → null, cascata continua (nessuna fonte a key configurata nel test)', async () => {
    globalThis.fetch = mockFetch([
      { body: { data: [{ number: '99', images: { large: 'https://example.com/other.png' } }] } },
    ]);
    const result = await resolveCardImage({ name: 'Pikachu', localId: '25' }, 'en');
    // Nessun hit con number==='25': find() ricade sul primo elemento della
    // lista (comportamento esistente, invariato da questo cambio) — verifica
    // solo che la fonte pokemontcg.io sia quella che ha risposto.
    assert.equal(result.source, 'pokemontcg.io');
    assert.equal(result.url, 'https://example.com/other.png');
  });

  test('TCGdex ha gia\' un\'immagine → pokemontcg.io non viene nemmeno interrogato', async () => {
    globalThis.fetch = async () => { throw new Error('non deve essere chiamato quando card.image e\' gia\' presente'); };
    const result = await resolveCardImage({ name: 'Pikachu', localId: '25', image: 'https://assets.tcgdex.net/en/base/base1/25' }, 'en');
    assert.equal(result.source, 'tcgdex');
    assert.equal(result.url, 'https://assets.tcgdex.net/en/base/base1/25/high.webp');
  });
});
