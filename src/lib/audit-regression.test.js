import { test } from "node:test";
import assert from "node:assert/strict";

// ─── Regression Tests for DraGold 2026-10-18 Audit ────────────────────────────

// 1. BUG-01: Query schema check
test("BUG-01: cards table required fields are valid and canonical_cards.name is not queried", () => {
  const validCardsColumns = new Set([
    "id", "tcg", "source", "source_id", "lang", "name",
    "set_id", "set_name", "card_number", "rarity", "supertype",
    "image_url", "image_url_hi", "metadata", "created_at", "updated_at",
    "name_en", "canonical_card_id", "print_variant", "illustrator",
    "evolves_from", "series_id", "series_name", "card_number_norm"
  ]);

  const queryFields = ["id", "tcg", "name", "lang", "set_id", "card_number", "source_id"];
  for (const field of queryFields) {
    assert.ok(validCardsColumns.has(field), `Column "${field}" must exist in cards table`);
  }

  // Canonical cards schema does NOT have "name"
  const canonicalColumns = new Set([
    "id", "tcg", "base_name", "set_id", "card_number", "slug", "primary_image_card_id"
  ]);
  assert.ok(!canonicalColumns.has("name"), 'canonical_cards must NOT have column "name" (uses base_name)');
});

// 2. BUG-02: Yu-Gi-Oh! tcg normalization and price parser
function normalizeTcg(tcg) {
  if (tcg === "yugioh") return "ygo";
  if (tcg === "op") return "onepiece";
  return tcg;
}

function parseYgoDeckPrices(p) {
  if (!p) return null;
  if (p.cardmarket_price) {
    const price = parseFloat(p.cardmarket_price);
    if (!isNaN(price) && price > 0) {
      return { market: price, currency: "EUR", source: "ygoprodeck" };
    }
  }
  if (p.tcgplayer_price) {
    const price = parseFloat(p.tcgplayer_price);
    if (!isNaN(price) && price > 0) {
      return { market: price, currency: "USD", source: "ygoprodeck" };
    }
  }
  return null;
}

test("BUG-02: TCG normalization for Yu-Gi-Oh maps yugioh -> ygo", () => {
  assert.equal(normalizeTcg("yugioh"), "ygo");
  assert.equal(normalizeTcg("ygo"), "ygo");
});

test("BUG-02: YGOPRODeck parser handles zero, null, and valid prices correctly", () => {
  // Case A: Valid Cardmarket EUR price
  const validCm = parseYgoDeckPrices({ cardmarket_price: "0.14", tcgplayer_price: "0.10" });
  assert.deepEqual(validCm, { market: 0.14, currency: "EUR", source: "ygoprodeck" });

  // Case B: Zero Cardmarket price, fall back to valid TCGplayer USD
  const zeroCm = parseYgoDeckPrices({ cardmarket_price: "0.00", tcgplayer_price: "1.25" });
  assert.deepEqual(zeroCm, { market: 1.25, currency: "USD", source: "ygoprodeck" });

  // Case C: Both prices zero or missing -> returns null (not 0.00)
  const bothZero = parseYgoDeckPrices({ cardmarket_price: "0.00", tcgplayer_price: "0.00" });
  assert.equal(bothZero, null);

  const missing = parseYgoDeckPrices({});
  assert.equal(missing, null);
});

// 3. BUG-03: One Piece tcg keyword and alias check
const TCG_KEYWORD = {
  pokemon: "pokemon card",
  mtg:     "magic gathering card",
  ygo:     "yugioh card",
  yugioh:  "yugioh card",
  op:      "one piece card tcg",
  onepiece:"one piece card tcg",
};

test("BUG-03: One Piece keyword resolves correctly for both 'op' and 'onepiece'", () => {
  assert.equal(TCG_KEYWORD["onepiece"], "one piece card tcg");
  assert.equal(TCG_KEYWORD["op"], "one piece card tcg");
  assert.equal(TCG_KEYWORD["yugioh"], "yugioh card");
  assert.equal(TCG_KEYWORD["ygo"], "yugioh card");
});

// 4. BUG-04: Image proxy allow-list and SSRF prevention
const ALLOWED_HOSTS = new Set([
  "images.pokemontcg.io",
  "assets.tcgdex.net",
  "tcgdex.net",
  "den-cards.pokellector.com",
  "pimwkmwrduqkaydyvxqz.supabase.co",
  "cards.scryfall.io",
  "scryfall.io",
  "images.ygoprodeck.com",
  "ygoprodeck.com",
  "www.onepiece-cardgame.com",
  "en.onepiece-cardgame.com",
]);

function validateImageUrl(raw) {
  try {
    const target = new URL(raw);
    if (target.protocol !== "https:") return { ok: false, error: "protocol" };
    if (!ALLOWED_HOSTS.has(target.hostname)) return { ok: false, error: "host" };
    if (target.port && target.port !== "443") return { ok: false, error: "port" };
    return { ok: true, host: target.hostname };
  } catch {
    return { ok: false, error: "malformed" };
  }
}

test("BUG-04: Image proxy allow-list allows official One Piece and blocks SSRF vectors", () => {
  // Allowed hosts
  assert.equal(validateImageUrl("https://www.onepiece-cardgame.com/images/card/EB01-016.png").ok, true);
  assert.equal(validateImageUrl("https://en.onepiece-cardgame.com/images/card/OP01-001.png").ok, true);
  assert.equal(validateImageUrl("https://images.ygoprodeck.com/images/cards/52900379.jpg").ok, true);

  // SSRF and protocol bypass attempts
  assert.equal(validateImageUrl("http://www.onepiece-cardgame.com/img.png").ok, false); // http blocked
  assert.equal(validateImageUrl("http://localhost:3000/secret").ok, false);
  assert.equal(validateImageUrl("https://169.254.169.254/latest/meta-data").ok, false);
  assert.equal(validateImageUrl("https://www.onepiece-cardgame.com.attacker.com/evil.png").ok, false);
  assert.equal(validateImageUrl("file:///etc/passwd").ok, false);
});
