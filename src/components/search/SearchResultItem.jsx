import { TCG_LIST, CARD_LANGS, ebayURL } from "../../DraGold.jsx";
import { getSetInfo, pickCardImage } from "../shared/cardImage.js";
import { CardObject } from "../shared/CardObject.jsx";

// discoveryMode: usato nelle rail "carte correlate" (AssetView) e nella griglia di
// SetDetailPage — contesti di scoperta, non di ricerca prezzo. In questi contesti
// niente prezzo/CTA eBay (non lo abbiamo caricato: mostrarlo sarebbe un falso "no
// price" per carte che magari un prezzo ce l'hanno — vedi validazione P1) e niente
// nome set ripetuto (già ovvio dal contesto: sei già dentro quel set/quella carta).
// Il componente di ricerca principale (SearchView → SearchResults) NON passa questo
// prop, quindi il suo comportamento resta identico a prima.
//
// identifyMode: Card ID microproduct (2026-08-26) — "identificare la versione
// esatta" richiede set/numero/rarità/lingua visibili sul risultato stesso,
// non un prezzo/CTA eBay (che qui non ha senso: e' uno strumento di
// identificazione, non di ricerca prezzo). Mostra sempre set_name (anche se
// discoveryMode e' true) + un badge rarity al posto del footer prezzo/eBay.
// Prop indipendente da discoveryMode, non passata da nessun chiamante
// esistente: zero impatto sugli altri usi di questo componente.
export function SearchResultItem({ card, priceInfo, country = "IT", cur = "EUR", eurRate = 0.92, onOpen, setsMap, discoveryMode = false, identifyMode = false }) {
  const imgUrl = pickCardImage(card) || card.imgUrl || card.img || null;
  const cardName = card.name || "—";
  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const setInfo = getSetInfo(card, setsMap);
  const priceUSD = priceInfo?.price_market ?? card.avgPrice ?? null;
  const priceStr = priceUSD != null
    ? cur === "EUR" ? `€${(priceUSD * eurRate).toFixed(2)}` : `$${Number(priceUSD).toFixed(2)}`
    : null;
  const initials = cardName.replace(/[^a-zA-Z ]/g, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  // Real <a href> to the canonical SEO page (/carta/{slug}) when the card's
  // canonical group has resolved a slug, else the SPA deep-link (/card/{id}
  // — still a real, crawlable URL, see DraGold.jsx's /card/{id} route) —
  // so every card tile is a genuine link (curl/crawler/middle-click/open-in-
  // new-tab all work), not just an onClick div. Client-side nav still goes
  // through onOpen (same AssetView transition as before) via preventDefault,
  // so behavior for a normal click is unchanged.
  const cardHref = card.slug
    ? `/carta/${encodeURIComponent(card.slug)}${card.lang && card.lang !== 'en' ? `?lang=${encodeURIComponent(card.lang)}` : ''}`
    : card.id ? `/card/${encodeURIComponent(card.id)}` : undefined;

  return (
    <div className="card-item" onClick={() => onOpen?.(card)}>
      {/* Real, crawlable <a href> to the canonical card page — purely for
          SEO/crawlers (Googlebot reads the href attribute regardless of CSS)
          and keyboard users (Tab focuses it, Enter still fires a click event
          even through pointer-events:none — only mouse hit-testing is
          disabled). pointer-events:none keeps it fully out of the way of
          mouse clicks/hover (the tilt effect on CardObject below needs real
          pointermove/pointerleave) and of the real eBay/variant-language
          <a> links further down (nesting a real <a> inside another <a> is
          invalid HTML, so this can't just wrap everything) — the outer div's
          onClick (unchanged from before) is what actually handles mouse
          navigation, same AssetView transition as always via onOpen. */}
      <a className="card-item-link" href={cardHref} aria-label={cardName}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onOpen?.(card); }} />
      <div className="card-item-img">
        <CardObject
          card={card}
          src={imgUrl}
          alt={cardName}
          variant="grid"
          fallback={
            <div className="card-img-ph">
              {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
              <span className="card-img-ph-init">{initials}</span>
            </div>
          }
        />
      </div>
      <div className="card-item-body">
        <div className="card-item-name" title={cardName}>{cardName}</div>
        <div className="card-item-meta">
          {setInfo?.symbol_url && <img src={setInfo.symbol_url} alt="" className="card-item-sym" onError={e=>{e.currentTarget.style.display='none';}} />}
          {(identifyMode || !discoveryMode) && card.set_name && <span className="card-item-set">{card.set_name}</span>}
          {card.card_number && <span className="card-item-num">#{card.card_number}</span>}
          {identifyMode && card.rarity && <span className="card-item-num">{card.rarity}</span>}
          {langInfo && <span className="card-item-lang">{langInfo.flag}</span>}
          {/* Print variant badge (Alternate Art / Promo / Foil / Parallel, ecc.) --
              stesso dato (cards.print_variant) gia' mostrato in CardPage.jsx come
              pill "Variant"; qui e' un badge di sola lettura sul risultato di ricerca. */}
          {card.print_variant && <span className="card-item-num card-item-variant">{card.print_variant}</span>}
          {card.variantCount > 0 && (
            <span className="card-item-num" title={`Also available in: ${card.variantLangs.join(', ').toUpperCase()}`}>
              +{card.variantCount} lang
            </span>
          )}
        </div>
        {/* Suggerimento multilingua: link reali (non onOpen/SPA) a /carta/{slug},
            uno per ogni stampa del gruppo canonico -- CardPage.jsx (rotta a parte,
            risolta in main.jsx prima del mount, vedi commento li') legge ?lang= per
            selezionare direttamente la tab/stampa giusta invece di ricadere sempre
            sul primary EN. Ogni link ha il proprio href/testo -> niente instradamento
            euristico lato Search, solo dati reali gia' presenti nel gruppo canonico
            (search.js groupByCanonical -> variantEntries). stopPropagation cosi' il
            click non apre anche onOpen (AssetView) sulla card sbagliata.*/}
        {card.variantEntries && card.variantEntries.length > 1 && (
          <div className="card-item-variants" onClick={e => e.stopPropagation()}>
            {card.variantEntries.filter(v => v.slug).map(v => {
              const vLangInfo = CARD_LANGS.find(l => l.c === v.lang);
              const href = `/carta/${encodeURIComponent(v.slug)}${v.lang && v.lang !== 'en' ? `?lang=${encodeURIComponent(v.lang)}` : ''}`;
              return (
                <a key={v.id} className="card-item-variant-link" href={href}
                  title={[vLangInfo?.flag || (v.lang || '').toUpperCase(), v.print_variant].filter(Boolean).join(' · ')}>
                  {vLangInfo?.flag || (v.lang || '').toUpperCase()}
                </a>
              );
            })}
          </div>
        )}
        {!discoveryMode && !identifyMode && (
          <div className="card-item-footer">
            {priceStr
              ? <span className="price-tag">{priceStr}</span>
              : (
                <a className="btn-ebay"
                  href={ebayURL(cardName, card.set_name || '', country, card.tcg || 'pokemon', card.card_number || '')}
                  target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}>
                  View on eBay ↗
                </a>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}
