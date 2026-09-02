import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfidenceLevel, confidenceTitle, CONFIDENCE_LABEL } from '../confidence.js';

test('normalizeConfidenceLevel: INVARIANTE — nessun "high"', () => {
  assert.equal(normalizeConfidenceLevel('medium'), 'medium');
  assert.equal(normalizeConfidenceLevel('low'), 'low');
  assert.equal(normalizeConfidenceLevel('high'), 'none');   // <-- mai "high"
  assert.equal(normalizeConfidenceLevel('none'), 'none');
  assert.equal(normalizeConfidenceLevel(undefined), 'none');
  assert.equal(normalizeConfidenceLevel('bogus'), 'none');
});

test('CONFIDENCE_LABEL: solo medium/low', () => {
  assert.deepEqual(Object.keys(CONFIDENCE_LABEL).sort(), ['low', 'medium']);
  assert.equal(CONFIDENCE_LABEL.high, undefined);
});

test('confidenceTitle: breakdown leggibile', () => {
  assert.equal(
    confidenceTitle({ observations: { n: 3 }, sources: { n: 1 }, recency: { newest_days: 0 } }),
    '3 observations · 1 source · updated today',
  );
  assert.equal(confidenceTitle({ sources: { n: 2 }, recency: { newest_days: 5 } }), '2 sources · updated 5d ago');
  assert.equal(confidenceTitle(null), undefined);
  assert.equal(confidenceTitle('{bad json'), undefined);
});
