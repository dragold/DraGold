export function toApiId(card) {
  return card?.id || "";
}


// Official image source rule (Card ID microproduct, data-quality patch
// 2026-08-26): "Add missing card" ships an OPTIONAL image URL field. To keep
// the catalog trustworthy we accept links only from domains the publishers
// themselves control -- not marketplaces, social media, Google Images, or
// third-party card databases (even ones DraGold's own sync pipeline reads
// from, like tcgdex/pokemontcg.io/scryfall -- those are community APIs, not
// the publisher's own site, so they don't qualify as "official source" for a
// user-submitted link). Verified via web search (2026-08-26):
//   - pokemon.com / tcg.pokemon.com -- Pokemon Company International's own
//     TCG card database (https://www.pokemon.com/us/pokemon-tcg/pokemon-cards).
//   - pokemon-card.com (incl. asia.pokemon-card.com) -- Pokemon Company's
//     official regional TCG site.
//   - onepiece-cardgame.com (incl. en./www. subdomains) -- Bandai's official
//     One Piece Card Game site, already the source DraGold's own catalog
//     sync uses for One Piece images.
// Deliberately NOT included without further confirmation: any Yu-Gi-Oh/MTG
// official domain, since this MVP's Card ID game list only surfaces
// Pokemon/One Piece as fully-supported today -- add explicitly, don't guess,
// if that expands.
export const ALLOWED_IMAGE_DOMAINS = [
  "pokemon.com",
  "pokemon-card.com",
  "onepiece-cardgame.com",
];

// True only for an https URL whose host is one of the allowed domains or an
// exact subdomain of one (matches "assets.pokemon.com" but not
// "pokemon.com.evil.example"). Empty/blank input is NOT validated here --
// the field is optional, callers decide whether "" counts as "no URL".
export function isOfficialImageUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_IMAGE_DOMAINS.some(d => host === d || host.endsWith("." + d));
}
