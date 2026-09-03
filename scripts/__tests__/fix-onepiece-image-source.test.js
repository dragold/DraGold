import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandaiImageUrl,
  hasCardNumber,
  isReleaseEventSet,
  isBundle,
  isAmbiguousVariant,
  buildOfficialIndex,
  findTwinUrl,
  classifyCard,
  verdictFromProbe,
  crawlStateByCard,
} from '../fix-onepiece-image-source.mjs';

test('bandaiImageUrl: EN vs JA, numero come chiave', () => {
  assert.equal(bandaiImageUrl('OP16-052', 'en'), 'https://en.onepiece-cardgame.com/images/cardlist/card/OP16-052.png');
  assert.equal(bandaiImageUrl('OP16-052', 'ja'), 'https://www.onepiece-cardgame.com/images/cardlist/card/OP16-052.png');
  assert.equal(bandaiImageUrl('ST32-002', 'en'), 'https://en.onepiece-cardgame.com/images/cardlist/card/ST32-002.png');
});

test('bandaiImageUrl: null se manca il numero', () => {
  assert.equal(bandaiImageUrl(null, 'en'), null);
  assert.equal(bandaiImageUrl('', 'en'), null);
  assert.equal(bandaiImageUrl('   ', 'en'), null);
});

test('isReleaseEventSet: solo suffisso -RE', () => {
  assert.equal(isReleaseEventSet('OP-17-RE'), true);
  assert.equal(isReleaseEventSet('OP-15-RE'), true);
  assert.equal(isReleaseEventSet('OP-17'), false);
  assert.equal(isReleaseEventSet('ST-31'), false);
  assert.equal(isReleaseEventSet(null), false);
});

test('isBundle: prodotti multi-carta', () => {
  assert.equal(isBundle({ name: 'Starter Decks 31-36 [Set of 6]' }), true);
  assert.equal(isBundle({ name: "Adventure on Kami's Island - Release Event Pack" }), true);
  assert.equal(isBundle({ name: "The World's Strongest Warriors - 4th Anniversary Tournament Pack" }), true);
  assert.equal(isBundle({ name: 'Monkey.D.Luffy' }), false);
});

test('isAmbiguousVariant: (SP), Alternate Art, Manga, Parallel', () => {
  assert.equal(isAmbiguousVariant({ name: 'Roronoa Zoro (EB04-007) (SP)', print_variant: null }), true);
  assert.equal(isAmbiguousVariant({ name: 'Shanks (022) (Alternate Art)', print_variant: null }), true);
  assert.equal(isAmbiguousVariant({ name: 'Shanks (022) (Manga)', print_variant: null }), true);
  assert.equal(isAmbiguousVariant({ name: 'DON!! Card (Alternate Art) (Rocks) (Special Foil)', print_variant: 'parallel' }), true);
  assert.equal(isAmbiguousVariant({ name: 'Nami', print_variant: 'parallel' }), true);
  assert.equal(isAmbiguousVariant({ name: 'Nami', print_variant: 'manga' }), true);
});

test('isAmbiguousVariant: carta base normale -> false', () => {
  assert.equal(isAmbiguousVariant({ name: 'Roronoa Zoro', print_variant: null }), false);
  assert.equal(isAmbiguousVariant({ name: 'Bonk Punch & Monster', print_variant: '' }), false);
  assert.equal(isAmbiguousVariant({ name: 'Shanks (020)', print_variant: 'base' }), false);
  assert.equal(isAmbiguousVariant({ name: 'Edward.Newgate (001)', print_variant: null }), false);
});

test('findTwinUrl: match solo sull URL base <numero>.png', () => {
  const idx = buildOfficialIndex([
    { lang: 'en', card_number: 'OP01-016', image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png' },
    { lang: 'en', card_number: 'OP01-025', image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-025_p1.png' },
  ]);
  assert.equal(
    findTwinUrl({ lang: 'en', card_number: 'OP01-016' }, idx),
    'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png',
  );
  // solo variante _p1 pubblicata -> NON è un twin base
  assert.equal(findTwinUrl({ lang: 'en', card_number: 'OP01-025' }, idx), null);
  // numero assente dall indice
  assert.equal(findTwinUrl({ lang: 'en', card_number: 'OP99-999' }, idx), null);
  // lingua diversa
  assert.equal(findTwinUrl({ lang: 'ja', card_number: 'OP01-016' }, idx), null);
});

const officialIdx = buildOfficialIndex([
  { lang: 'en', card_number: 'OP01-016', image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png' },
]);

test('classifyCard: già ufficiale -> already_official (idempotenza)', () => {
  const url = 'https://en.onepiece-cardgame.com/images/cardlist/card/OP17-001.png';
  const c = classifyCard({ card_number: 'OP17-001', lang: 'en', set_id: 'OP-17', name: 'Edward.Newgate (001)', image_url: url, image_url_hi: url }, { officialIndex: officialIdx });
  assert.equal(c.disposition, 'already_official');
});

test('classifyCard: twin -> resolvable tier twin', () => {
  const c = classifyCard(
    { card_number: 'OP01-016', lang: 'en', set_id: 'OP-15-RE', name: 'Nami', image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg', image_url_hi: 'https://tcgplayer-cdn.tcgplayer.com/product/1_200w.jpg' },
    { officialIndex: officialIdx },
  );
  assert.equal(c.disposition, 'resolvable');
  assert.equal(c.tier, 'twin');
  assert.equal(c.twinUrl, 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png');
});

test('classifyCard: base senza twin -> resolvable tier base', () => {
  const c = classifyCard(
    { card_number: 'OP17-020', lang: 'en', set_id: 'OP-17', name: 'Shanks (020)', image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/2_200w.jpg', image_url_hi: 'https://tcgplayer-cdn.tcgplayer.com/product/2_200w.jpg' },
    { officialIndex: officialIdx },
  );
  assert.equal(c.disposition, 'resolvable');
  assert.equal(c.tier, 'base');
});

test('classifyCard: RE senza twin -> re_pending_review (gate), poi resolvable con includeRE', () => {
  const card = { card_number: 'OP17-002', lang: 'en', set_id: 'OP-17-RE', name: 'Luffy', image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/3_200w.jpg', image_url_hi: 'https://tcgplayer-cdn.tcgplayer.com/product/3_200w.jpg' };
  assert.equal(classifyCard(card, { officialIndex: officialIdx }).disposition, 're_pending_review');
  const withFlag = classifyCard(card, { officialIndex: officialIdx, includeRE: true });
  assert.equal(withFlag.disposition, 'resolvable');
  assert.equal(withFlag.tier, 're');
});

test('classifyCard: variante e bundle non risolte anche con includeRE', () => {
  assert.equal(
    classifyCard({ card_number: 'EB04-007', lang: 'en', set_id: 'OP-17', name: 'Roronoa Zoro (EB04-007) (SP)', image_url: 'x', image_url_hi: 'x' }, { includeRE: true }).disposition,
    'ambiguous_variant',
  );
  assert.equal(
    classifyCard({ card_number: null, lang: 'en', set_id: 'OP-15-RE', name: "Adventure on Kami's Island - Release Event Pack", image_url: 'x', image_url_hi: 'x' }, {}).disposition,
    'bundle',
  );
  assert.equal(
    classifyCard({ card_number: null, lang: 'en', set_id: 'OP-17', name: 'DON!! Card (Alternate Art) (Gold)', print_variant: 'parallel', image_url: 'x', image_url_hi: 'x' }, {}).disposition,
    'no_card_number',
  );
});

test('verdictFromProbe: mappa esiti probe', () => {
  assert.deepEqual(verdictFromProbe({ usable: true, reason: null }), { action: 'apply', reason: null });
  assert.deepEqual(verdictFromProbe({ usable: false, reason: 'not_found' }), { action: 'skip', reason: 'bandai_404' });
  assert.deepEqual(verdictFromProbe({ usable: false, reason: 'blocked' }), { action: 'skip', reason: 'bandai_blocked' });
  assert.deepEqual(verdictFromProbe({ usable: false, reason: 'transient' }), { action: 'skip', reason: 'bandai_transient' });
});

test('crawlStateByCard: peggiore stato per carta', () => {
  const m = crawlStateByCard([
    { card_id: 'a', field: 'image_url', classification: 'A' },
    { card_id: 'a', field: 'image_url_hi', classification: 'E' },
    { card_id: 'b', field: 'image_url', classification: 'A' },
    { card_id: 'b', field: 'image_url_hi', classification: 'B' },
    { card_id: 'c', field: 'image_url', classification: 'D' },
  ]);
  assert.equal(m.get('a'), 'BROKEN');
  assert.equal(m.get('b'), 'VALID');
  assert.equal(m.get('c'), 'MISSING');
});

test('hasCardNumber', () => {
  assert.equal(hasCardNumber({ card_number: 'OP01-001' }), true);
  assert.equal(hasCardNumber({ card_number: '' }), false);
  assert.equal(hasCardNumber({ card_number: null }), false);
});
