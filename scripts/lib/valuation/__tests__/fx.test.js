import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrankfurter, toEur, eurPerUnit } from '../fx.js';

test('parseFrankfurter: risposta reale', () => {
  const p = parseFrankfurter({ amount: 1, base: 'EUR', date: '2026-09-02', rates: { USD: 1.1578 } });
  assert.equal(p.base, 'EUR');
  assert.equal(p.date, '2026-09-02');
  assert.equal(p.rates.USD, 1.1578);
});

test('parseFrankfurter: scarta tassi non validi, lancia su forma inattesa', () => {
  assert.deepEqual(parseFrankfurter({ base: 'EUR', date: 'x', rates: { USD: 0, GBP: 0.85 } }).rates, { GBP: 0.85 });
  assert.throws(() => parseFrankfurter({ base: 'USD', rates: {} }));
  assert.throws(() => parseFrankfurter(null));
});

test('toEur', () => {
  assert.equal(toEur(11.58, 'USD', { USD: 1.1578 }), 10);       // 11.58 / 1.1578
  assert.equal(toEur(10, 'EUR', { USD: 1.16 }), 10);            // passthrough
  assert.equal(toEur(10, 'GBP', { USD: 1.16 }), null);          // tasso mancante
  assert.equal(toEur(null, 'USD', { USD: 1.16 }), null);
});

test('eurPerUnit', () => {
  assert.equal(eurPerUnit('EUR', {}), 1);
  assert.equal(Math.round(eurPerUnit('USD', { USD: 1.25 }) * 100) / 100, 0.8);
  assert.equal(eurPerUnit('JPY', { USD: 1.25 }), null);
});
