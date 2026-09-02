import test from 'node:test';
import assert from 'node:assert/strict';
import { median, quantile, iqr, weightedMedian, pctChange } from '../stats.js';

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
});

test('quantile (tipo 7)', () => {
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5.5);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1), 1.9);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
  assert.equal(quantile([], 0.5), null);
});

test('iqr', () => {
  assert.equal(iqr([1, 2, 3, 4, 5, 6, 7, 8]), 3.5); // Q3=6.25 Q1=2.75
  assert.equal(iqr([5]), null);
});

test('weightedMedian', () => {
  assert.equal(weightedMedian([{ value: 10, weight: 1 }, { value: 20, weight: 3 }]), 20);
  assert.equal(weightedMedian([{ value: 10, weight: 1 }, { value: 20, weight: 1 }]), 15);
  assert.equal(weightedMedian([]), null);
  assert.equal(weightedMedian([{ value: 5, weight: 0 }]), null);
});

test('pctChange', () => {
  assert.equal(pctChange(10, 12), 20);
  assert.equal(pctChange(20, 15), -25);
  assert.equal(pctChange(0, 5), null);
});
