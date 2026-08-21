import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDumpArgs, summarizeCacheStatus } from '../dump-cards.mjs'

test('parseDumpArgs: default -> pokemon, en+ja, out standard', () => {
  const cfg = parseDumpArgs([])
  assert.equal(cfg.tcg, 'pokemon')
  assert.deepEqual(cfg.langs, ['en', 'ja'])
  assert.equal(cfg.out, 'scripts/image-audit/data/cards-pokemon-en-ja.ndjson')
})

test('parseDumpArgs: --tcg=onepiece --langs=en,ja -> out derivato coerente', () => {
  const cfg = parseDumpArgs(['--tcg=onepiece', '--langs=en,ja'])
  assert.equal(cfg.tcg, 'onepiece')
  assert.deepEqual(cfg.langs, ['en', 'ja'])
  assert.equal(cfg.out, 'scripts/image-audit/data/cards-onepiece-en-ja.ndjson')
})

test('parseDumpArgs: --out esplicito ha priorità sul default derivato', () => {
  const cfg = parseDumpArgs(['--tcg=onepiece', '--out=custom.ndjson'])
  assert.equal(cfg.out, 'custom.ndjson')
})

test('parseDumpArgs: --langs normalizza spazi/maiuscole', () => {
  const cfg = parseDumpArgs(['--langs= EN , Ja '])
  assert.deepEqual(cfg.langs, ['en', 'ja'])
})

test('parseDumpArgs: --tcg vuoto lancia (mai un dump senza filtro tcg)', () => {
  assert.throws(() => parseDumpArgs(['--tcg=']), /tcg/)
})

test('parseDumpArgs: --langs vuoto lancia', () => {
  assert.throws(() => parseDumpArgs(['--langs=']), /langs/)
})

test('summarizeCacheStatus: nessuna riga -> none', () => {
  assert.equal(summarizeCacheStatus([]), 'none')
  assert.equal(summarizeCacheStatus(null), 'none')
  assert.equal(summarizeCacheStatus(undefined), 'none')
})

test('summarizeCacheStatus: almeno una ready -> ready, anche se altre sono in errore', () => {
  assert.equal(summarizeCacheStatus([{ status: 'error' }, { status: 'ready' }]), 'ready')
})

test('summarizeCacheStatus: nessuna ready ma almeno una error -> error', () => {
  assert.equal(summarizeCacheStatus([{ status: 'pending' }, { status: 'error' }]), 'error')
})

test('summarizeCacheStatus: solo pending -> pending', () => {
  assert.equal(summarizeCacheStatus([{ status: 'pending' }]), 'pending')
})
