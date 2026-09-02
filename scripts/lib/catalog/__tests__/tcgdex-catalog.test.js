import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTcgdexSet, listTcgdexSetCardNumbers } from '../sources/tcgdex-catalog.js';

// Fixture: risposta reale /v2/en/sets/me05, verificata 2026-09-02.
const ME05_DETAIL = {
  id: 'me05',
  name: 'Pitch Black',
  releaseDate: '2026-07-17',
  cardCount: { firstEd: 0, holo: 58, normal: 68, official: 84, reverse: 74, total: 120 },
  serie: { id: 'me', name: 'Mega Evolution' },
  logo: 'https://assets.tcgdex.net/en/me/me05/logo',
  symbol: 'https://assets.tcgdex.net/univ/me/me05/symbol',
  abbreviation: 'PBL',
  cards: [{ id: 'me05-001', image: 'x', localId: '001', name: 'Tropius' }],
};

test('mapTcgdexSet: detail completo', () => {
  const m = mapTcgdexSet(ME05_DETAIL);
  assert.equal(m.code, 'me05');
  assert.equal(m.name, 'Pitch Black');
  assert.equal(m.releaseDate, '2026-07-17');
  assert.equal(m.cardCountOfficial, 84);
  assert.equal(m.cardCountTotal, 120);
  assert.equal(m.serieId, 'me');
  assert.equal(m.serieName, 'Mega Evolution');
  assert.equal(m.abbreviation, 'PBL');
  assert.ok(m.logo && m.symbol);
});

test('mapTcgdexSet: riga di lista (senza releaseDate/serie) non lancia', () => {
  const m = mapTcgdexSet({ id: 'me05', name: 'Pitch Black', cardCount: { total: 120, official: 84 } });
  assert.equal(m.releaseDate, null);
  assert.equal(m.serieId, null);
  assert.equal(m.cardCountTotal, 120);
});

test('listTcgdexSetCardNumbers: chiavi normalizzate dai localId', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ name: 'X', cards: [
      { localId: '001', name: 'A' }, { localId: '025', name: 'B' }, { localId: 'TG01', name: 'C' },
    ] }),
  });
  const nums = await listTcgdexSetCardNumbers('en', 'me05', { fetchImpl });
  assert.deepEqual([...nums].sort(), ['1', '25', 'TG01']);
});
