/* ─── pickCardImage: priorita immagine — 1) card_image_cache (status ready), 2) image_url_hi/image_url originale, 3) null -> placeholder ─── */
export function pickCardImage(obj) {
  if (!obj) return null;
  const cache = Array.isArray(obj.card_image_cache) ? obj.card_image_cache : [];
  const ready = cache.find(function (c) { return c && c.status === 'ready' && c.cached_url; });
  if (ready) return ready.cached_url;
  return obj.image_url_hi || obj.image_url || null;
}

// Cerca il set in setsMap usando cards.set_id (fonte primaria, verificata contro il
// DB reale l'11/08/2026: il card_number di Pokemon in produzione NON contiene mai un
// trattino, quindi il vecchio parsing "prefisso-numero" non ha mai fatto match per
// questo TCG — bug preesistente, corretto qui). Fallback storico sul parsing da
// card_number mantenuto per compatibilità con eventuali fonti dati che lo usano
// ancora (es. alcuni set con codice tipo "OP05-119").
export function getSetInfo(card, setsMap) {
  if (!setsMap) return null;
  if (card?.set_id) {
    const info = setsMap.get(`${card.tcg}:${card.set_id}`);
    if (info) return info;
  }
  if (card?.card_number?.includes('-')) {
    const prefix = card.card_number.split('-')[0];
    const key = `${card.tcg}:${card.tcg === 'pokemon' ? prefix.toLowerCase() : prefix}`;
    return setsMap.get(key) || null;
  }
  return null;
}
