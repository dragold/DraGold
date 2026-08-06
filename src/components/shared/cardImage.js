/* ─── pickCardImage: priorita immagine — 1) card_image_cache (status ready), 2) image_url_hi/image_url originale, 3) null -> placeholder ─── */
export function pickCardImage(obj) {
  if (!obj) return null;
  const cache = Array.isArray(obj.card_image_cache) ? obj.card_image_cache : [];
  const ready = cache.find(function (c) { return c && c.status === 'ready' && c.cached_url; });
  if (ready) return ready.cached_url;
  return obj.image_url_hi || obj.image_url || null;
}

// Estrae il set_code dal card_number e cerca in setsMap.
// Pokemon: "sv3-125" → key "pokemon:sv3" | OP: "OP05-119" → key "onepiece:OP05"
export function getSetInfo(card, setsMap) {
  if (!setsMap || !card?.card_number?.includes('-')) return null;
  const prefix = card.card_number.split('-')[0];
  const key = `${card.tcg}:${card.tcg === 'pokemon' ? prefix.toLowerCase() : prefix}`;
  return setsMap.get(key) || null;
}
