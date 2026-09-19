// Test per funzioni critical di search: norm, tokenize, cardCodeIlikePattern
import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, tokenize, cardCodeIlikePattern } from './pure.js';

// Indipendente da EventEmitter/Supabase — le funzioni pure sono stateless.
// nessuna dipendenza da DB/Supabase/EventEmitter.

test('norm: lowercase + rimuovi non alfanumerici', () => {
  assert.equal(norm('Hello World!'), 'helloworld');
  assert.equal(norm('P-159'), 'p159');
  assert.equal(norm('OP05-001'), 'op05001');
  assert.equal(norm(''), '');
  assert.equal(norm(null), '');
  assert.equal(norm(undefined), '');
  assert.equal(norm('  spazi  '), 'spazi');
});

test('tokenize: splitta su non-alfanumerici, filtra Boolean', () => {
  assert.deepEqual(tokenize('Charizard ex'), ['charizard', 'ex']);
  assert.deepEqual(tokenize('P-159'), ['p', '159']);
  assert.deepEqual(tokenize('sv3-pt5'), ['sv3', 'pt5']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('a'), ['a']);
  assert.deepEqual(tokenize('1'), ['1']);
});

test('cardCodeIlikePattern: wrapping con wildcard', () => {
  assert.equal(cardCodeIlikePattern('p159'), '%p159%');
  assert.equal(cardCodeIlikePattern('sv03'), '%sv03%');
  assert.equal(cardCodeIlikePattern('hello', '_'), '_hello_');
  assert.equal(cardCodeIlikePattern(''), '%%');
});

test('cardCodeIlikePattern: input già normalizzato (norm() chiamato prima)', () => {
  // In produzione cardCodeIlikePattern riceve output di norm()
  assert.equal(cardCodeIlikePattern(norm('P-159')), '%p159%');
  assert.equal(cardCodeIlikePattern(norm('sv3-pt5')), '%sv3pt5%');
});

test('tokenize edge cases', () => {
  assert.deepEqual(tokenize('foo-bar_baz'), ['foo', 'bar', 'baz']);
  assert.deepEqual(tokenize('CAPS'), ['caps']);
  assert.deepEqual(tokenize('123'), ['123']);
  assert.deepEqual(tokenize('!@#$%'), []);
});

test('norm edge cases', () => {
  assert.equal(norm('CAPS'), 'caps');
  assert.equal(norm('123'), '123');
  assert.equal(norm('!@#$%'), '');
  assert.equal(norm('a1b2c3'), 'a1b2c3');
});
