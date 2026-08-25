// DraGold - Public Card Page (Fase 2, V1)
// Componente isolato: DraGold.jsx fa solo routing verso questa pagina.
//
// Task 6 (Card Detail UX/UI): la pagina diventa il nodo centrale del prodotto
// (Search/Explorer -> Card -> Set/Collection/Academy -> Variants/Related).
// Nessuna nuova query: le sezioni Variants/Multilingual riusano
// state.data.variants (gia' caricato da cardPageData.js, scope
// canonical_card_id) come stato di selezione client-side — tutte le righe di
// quel gruppo condividono la STESSA slug/URL (vedi canonical_cards_group_uk =
// tcg+set_id+card_number), quindi "aprire la carta in un'altra lingua/stampa"
// e' letteralmente questa pagina che mostra un altro record reale, non una
// nuova pagina. Related Cards usa invece sameSetCards (query gia' esistente),
// che punta a canonical group DIVERSI (stesso set, altra card).
import { getCardPageData } from './cardPageData.js'
import { addOrIncrementCollection, addToWatchlist, decrementOrRemoveCollection, supabase } from '../../supabase.js'
import { buildSetSlug } from '../../lib/setSlug.js'
import { getTcgHub } from '../../lib/tcgConfig.js'
import { slugifyIllustrator } from '../../lib/illustratorSlug.js'
import { useAuth } from '../../lib/auth.js'
// Market/Purchase Discovery MVP (2026-08-25): stessa costruzione URL/affiliate
// eBay già usata da AssetView.jsx, importata dal modulo leggero lib/ebayLinks.js
// (non da DraGold.jsx, il bundle SPA pesante che questa pagina evita apposta —
// vedi commento su LANG_LABELS sopra) — nessuna seconda implementazione.
import { ebayURL, ebayItemURL } from '../../lib/ebayLinks.js'
import { useEffect, useState, createElement as h, Fragment } from 'react'

// Etichette fonte prezzo — stessa mappa (ridotta alle sole fonti realmente
// presenti in card_prices) già usata da AssetView.jsx SOURCE_LABELS, per non
// mostrare mai un "Market price" senza dire da dove viene: può essere l'ultima
// riga di QUALSIASI fonte in card_prices, eBay sold-average incluso quando è
// la più recente — l'etichetta è quindi parte della "distinzione chiara"
// richiesta dal task, non solo un dettaglio estetico.
const PRICE_SOURCE_LABELS = {
  tcgplayer: 'TCGplayer', cardmarket: 'Cardmarket', justtcg: 'JustTCG',
  ebay_sold: 'eBay (sold)', ebay_finding: 'eBay (sold)',
}
function priceSourceLabel(source) {
  if (!source) return 'market'
  if (PRICE_SOURCE_LABELS[source]) return PRICE_SOURCE_LABELS[source]
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Numero carta "distintivo" = filtrabile in modo affidabile su eBay — stessa
// regola/soglia di AssetView.jsx (Fix #3 lì): un numero corto puro come "5"
// matcherebbe qualunque titolo, falsi positivi, quindi niente eBay Live in
// quel caso.
function isDistinctiveCardNumber(cardNum) {
  return !!cardNum && (/[a-z]/i.test(cardNum) || /[-/]/.test(cardNum) || cardNum.replace(/[^a-z0-9]/gi, '').length >= 5)
}
function formatPrice(value, currency) {
  if (value == null) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
  } catch {
    return `${value} ${currency || ''}`
  }
}

// Etichette lingua leggibili per i pill di switch (Task 6, sez. 9). Piccola
// mappa locale invece di importare CARD_LANGS da DraGold.jsx: quella e'
// definita dentro il componente shell dell'intera SPA (bundle pesante), qui
// serve solo un dizionario di 9 righe.
const LANG_LABELS = {
  en: 'English', ja: '日本語', it: 'Italiano', de: 'Deutsch', fr: 'Français',
  es: 'Español', pt: 'Português', id: 'Indonesia', ko: '한국어',
}
function langLabel(code) {
  return LANG_LABELS[code] || (code || '').toUpperCase()
}

function setSeoMeta({ title, description, image, url }) {
  if (title) document.title = title
  const setMeta = (selector, attr, isProperty, content) => {
    let el = document.querySelector(selector)
    if (!el) {
      el = document.createElement('meta')
      if (isProperty) el.setAttribute('property', attr)
      else el.setAttribute('name', attr)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }
  const setLink = (rel, href) => {
    let el = document.querySelector(`link[rel="${rel}"]`)
    if (!el) {
      el = document.createElement('link')
      el.setAttribute('rel', rel)
      document.head.appendChild(el)
    }
    el.setAttribute('href', href)
  }
  if (description) {
    setMeta('meta[name="description"]', 'description', false, description)
    setMeta('meta[property="og:description"]', 'og:description', true, description)
    setMeta('meta[name="twitter:description"]', 'twitter:description', false, description)
  }
  if (title) {
    setMeta('meta[property="og:title"]', 'og:title', true, title)
    setMeta('meta[name="twitter:title"]', 'twitter:title', false, title)
  }
  if (image) {
    setMeta('meta[property="og:image"]', 'og:image', true, image)
    setMeta('meta[name="twitter:image"]', 'twitter:image', false, image)
  }
  if (url) {
    setMeta('meta[property="og:url"]', 'og:url', true, url)
    setLink('canonical', url)
  }
  setMeta('meta[property="og:type"]', 'og:type', true, 'product')
  setMeta('meta[name="twitter:card"]', 'twitter:card', false, 'summary_large_image')
}

// Block 4 - SEO Foundation: nessuna gestione robots/noindex esisteva prima.
// Serve per il caso not_found (pagina vuota che altrimenti resta indicizzabile
// con status 200 lato client) e per ripulire il meta quando si torna a una
// card valida dopo aver visitato uno slug inesistente (stessa SPA, stesso DOM).
function setRobotsMeta(content) {
  let el = document.querySelector('meta[name="robots"]')
  if (content) {
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'robots')
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  } else if (el) {
    el.remove()
  }
}

function setJsonLd(data) {
    let el = document.getElementById('ld-card')
    if (!el) {
          el = document.createElement('script')
          el.type = 'application/ld+json'
          el.id = 'ld-card'
          document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
}

export default function CardPage({ slug }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [ctaMsg, setCtaMsg] = useState('')
  // Task 6 — quale record del canonical group e' mostrato in questo momento
  // (null = usa il primary curato). Cambia cliccando un pill lingua/variant,
  // mai una navigazione: stessa URL, stesso slug, un altro record reale.
  const [selectedId, setSelectedId] = useState(null)
  const [myQty, setMyQty] = useState(0)
  const [qtyLoading, setQtyLoading] = useState(false)
  const [collectBusy, setCollectBusy] = useState(false)
  const [decrementBusy, setDecrementBusy] = useState(false)
  // eBay live listings (Market/Purchase Discovery MVP) — stesso endpoint reale
  // già usato da AssetView.jsx (/api/ebay-search, Browse API), stesso gate sul
  // numero carta distintivo, stesso filtro dei match sul titolo. Ricaricato
  // quando cambia il record selezionato (lingua/variant = card_number diverso).
  const [ebayItems, setEbayItems] = useState([])
  const { status: authStatus, isAuthed } = useAuth()

useEffect(() => {
  let alive = true
  setState({ loading: true, data: null, error: null })
  setSelectedId(null)
  setCtaMsg('')
  getCardPageData(slug).then(data => {
    if (!alive) return
    if (!data) { setState({ loading: false, data: null, error: 'not_found' }); return }
    setState({ loading: false, data, error: null })
  }).catch(err => {
    if (!alive) return
    setState({ loading: false, data: null, error: err.message || 'error' })
  })
  return () => { alive = false }
}, [slug])

useEffect(() => {
  const d = state.data
  if (!d) return
  const { primary, currentPrice, displayName, displaySetName, canonical } = d
  const priceTxt = currentPrice?.price_market ? ` — ${formatPrice(currentPrice.price_market, currentPrice.currency)}` : ''
  // Block 4 - SEO Foundation: usare canonical.slug (dato DB, gia' risolto e
  // deterministico dopo il fix in cardPageData.js) invece del parametro slug
  // grezzo preso dall'URL. Sono quasi sempre identici, ma se in futuro
  // arrivasse un redirect/alias o uno slug con casing diverso nell'URL
  // digitato dall'utente, il canonical deve sempre puntare alla versione
  // canonica reale, non a qualunque stringa sia finita nella barra indirizzi.
  const canonicalSlug = (canonical && canonical.slug) || slug
  setRobotsMeta(null)
  setSeoMeta({
    title: `${displayName} (${displaySetName} #${primary.card_number}) — DraGold${priceTxt}`,
    description: `${displayName} — ${displaySetName} #${primary.card_number}, rarity ${primary.rarity || 'N/A'}. Card details, variants and price history on DraGold.`,
    image: primary.image_url_hi || primary.image_url,
    url: `https://dragold.org/carta/${canonicalSlug}`,
  })

      const cardUrl = `https://dragold.org/carta/${canonicalSlug}`
      const imageUrl = primary.image_url_hi || primary.image_url
      // Block 5 - SEO Foundation for Sets: ora che /set/{slug} esiste davvero,
      // il breadcrumb torna a 3 livelli con un URL reale (non piu' fittizio
      // come prima del fix di Block 4). setSlug e' deterministico da tcg+set_id,
      // stessa regola gia' usata per generare gli slug carta.
      const setSlug = buildSetSlug(primary.tcg, primary.set_id)
      const setUrl = setSlug ? `https://dragold.org/set/${setSlug}` : null
      // Block 6 - TCG Hub SEO Foundation: /{tcg} esiste davvero ora, il breadcrumb
      // arriva a 4 livelli. hubUrl usa direttamente primary.tcg: e' gia' identico
      // al path della Hub (cards.tcg === 'pokemon' === /pokemon), zero mapping.
      const tcgHub = getTcgHub(primary.tcg)
      const hubUrl = tcgHub ? `https://dragold.org/${primary.tcg}` : null
      const graph = []
      const breadcrumbItems = [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
      ]
      if (hubUrl) breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: tcgHub.label, item: hubUrl })
      if (setUrl) breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: displaySetName, item: setUrl })
      breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: displayName, item: cardUrl })
      graph.push({ '@type': 'BreadcrumbList', itemListElement: breadcrumbItems })
      if (imageUrl) {
              graph.push({ '@type': 'ImageObject', contentUrl: imageUrl, url: imageUrl })
      }
      const productNode = {
              '@type': 'Product',
              name: displayName,
              image: imageUrl ? [imageUrl] : undefined,
              description: `${displayName} — ${displaySetName} #${primary.card_number}`,
              sku: primary.card_number,
              brand: { '@type': 'Brand', name: primary.tcg },
              url: cardUrl,
      }
      if (currentPrice && currentPrice.price_market != null) {
              productNode.offers = {
                        '@type': 'Offer',
                        priceCurrency: currentPrice.currency || 'USD',
                        price: currentPrice.price_market,
                        url: cardUrl,
              }
      }
      graph.push(productNode)
      setJsonLd({ '@context': 'https://schema.org', '@graph': graph })
}, [state.data])

// Task 6 — record del canonical group attualmente mostrato (vedi commento su
// selectedId sopra). Va calcolato prima degli early return sotto perche' gli
// hook successivi (quantita' collection) dipendono da selected.id.
const selected = state.data
  ? (state.data.variants.find(v => v.id === selectedId) || state.data.primary)
  : null

// Quantita' reale in Collection per il record mostrato — stessa RPC/tabella
// gia' usata da AssetView/Portfolio (collection.quantity via RLS scoped a
// auth.uid()), nessuna nuova logica server-side. Riparte da capo quando cambia
// la card selezionata (lingua/variant diversi = card_api_id diverso).
useEffect(() => {
  if (!selected || !isAuthed) { setMyQty(0); return }
  let cancelled = false
  setQtyLoading(true)
  supabase.from('collection').select('quantity').eq('card_api_id', selected.id).maybeSingle()
    .then(({ data }) => { if (!cancelled) setMyQty(data?.quantity || 0) })
    .catch(() => { if (!cancelled) setMyQty(0) })
    .finally(() => { if (!cancelled) setQtyLoading(false) })
  return () => { cancelled = true }
}, [isAuthed, selected && selected.id])

// eBay live listings (Market/Purchase Discovery MVP, 2026-08-25) — stesso
// endpoint reale già in produzione per Card Detail (/api/ebay-search, Browse
// API), stessa soglia "numero distintivo" per evitare falsi positivi. Va
// prima degli early return sotto per la stessa ragione dell'effect sopra.
useEffect(() => {
  const cardNum = selected?.card_number || ''
  if (!selected || !isDistinctiveCardNumber(cardNum)) { setEbayItems([]); return }
  let cancelled = false
  const numNorm = cardNum.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const suffix = selected.tcg === 'mtg' ? 'magic the gathering'
    : selected.tcg === 'ygo' ? 'yugioh'
    : selected.tcg === 'onepiece' ? 'one piece card' : 'pokemon card'
  const q = `${selected.name} ${cardNum} ${suffix}`.replace(/\s+/g, ' ').trim()
  fetch(`/api/ebay-search?q=${encodeURIComponent(q)}&market=US&limit=20`, { signal: AbortSignal.timeout(8000) })
    .then(r => (r && r.ok) ? r.json() : { items: [] })
    .then(d => {
      if (cancelled) return
      const matches = (d.items || [])
        .filter(it => (it.title || '').replace(/[^a-z0-9]/gi, '').toLowerCase().includes(numNorm))
        .slice(0, 5)
      setEbayItems(matches)
    })
    .catch(() => { if (!cancelled) setEbayItems([]) })
  return () => { cancelled = true }
}, [selected && selected.id])

if (state.loading) {
  // Riusa il sistema skeleton globale (.skel-*, definito in styles.css e già
  // usato da SearchResults/HotPicks/Portfolio/Alerts) invece di un testo statico.
  return h('div', { style: styles.page }, h('div', { style: styles.wrap },
    h('div', { className: 'skel-card', style: { display: 'flex', gap: 32, flexWrap: 'wrap', background: 'transparent', border: 'none', padding: 0 } },
      h('div', { className: 'skel-img', style: { width: 280, maxWidth: '100%', aspectRatio: '3/4', flex: '0 0 280px', marginBottom: 0 } }),
      h('div', { style: { flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 } },
        h('div', { className: 'skel-line', style: { height: 28, width: '70%' } }),
        h('div', { className: 'skel-line w40' }),
        h('div', { className: 'skel-line', style: { height: 78, width: '100%', marginTop: 10 } })
      )
    )
  ))
}
  if (state.error || !state.data) {
    // Block 4 - SEO Foundation: prima non veniva impostato nessun robots meta
    // per questo stato. Con routing puramente client-side (nessuna vera 404
    // HTTP, vedi vercel.json rewrite catch-all) uno slug inesistente serviva
    // comunque status 200 con contenuto vuoto e indicizzabile: rischio di
    // "soft 404" indicizzati da Google. noindex e' il minimo compatibile con
    // l'architettura attuale senza introdurre SSR/status code reali.
    setRobotsMeta('noindex')
    return h('div', { style: styles.page }, h('div', { style: styles.center },
                                              h('h1', { style: styles.h1 }, 'Card not found'),
                                              h('p', { style: styles.muted }, 'This card is not yet available on DraGold.'),
                                              h('a', { href: '/', style: styles.link }, 'Back to home')
                                              ))
  }

const primary = state.data.primary
  const displayName = state.data.displayName
  const displaySetName = state.data.displaySetName
  const variants = state.data.variants
  const languages = state.data.languages
  const rarity = state.data.rarity
  const currentPrice = state.data.currentPrice
  const priceHistory = state.data.priceHistory
  const soldByTimeframe = state.data.soldByTimeframe || {}
  const sameSetCards = state.data.sameSetCards

async function handleAddCollection() {
  if (!isAuthed) { window.location.href = '/login'; return }
  if (collectBusy) return
  setCollectBusy(true)
  const res = await addOrIncrementCollection({
    card_api_id: selected.id, tcg: selected.tcg, card_name: selected.name,
    set_name: selected.set_name, image_url: selected.image_url,
    card_number: selected.card_number || null, rarity: selected.rarity || null,
    language: selected.lang || null,
  })
  setCollectBusy(false)
  if (res && res.error) { setCtaMsg('Error: ' + (res.error.message || res.error)); return }
  const row = res?.data
  if (row?.quantity != null) setMyQty(row.quantity)
  setCtaMsg(row?.out_inserted ? 'Added to your collection!' : `Another copy added — you now have ${row?.quantity ?? 'multiple'}`)
}

// Rimuovi una copia — gemella simmetrica di handleAddCollection, stessa RPC
// atomica decrement_or_remove_collection gia' usata da AssetView/Portfolio
// (Task A). Nessuna seconda implementazione: stessa funzione supabase.js.
async function handleDecrementCollection() {
  if (!isAuthed) { window.location.href = '/login'; return }
  if (decrementBusy || myQty <= 0) return
  setDecrementBusy(true)
  const res = await decrementOrRemoveCollection(selected.id)
  setDecrementBusy(false)
  if (res && res.error) { setCtaMsg('Error: ' + (res.error.message || res.error)); return }
  const row = res?.data
  if (!row) { setCtaMsg('Could not remove copy.'); return }
  setMyQty(row.quantity)
  setCtaMsg(row.out_deleted ? 'Removed from your collection' : `Copy removed — you now have ${row.quantity}`)
}

async function handleAddWatchlist() {
  setCtaMsg('Adding...')
  const res = await addToWatchlist({ tcg: primary.tcg, cardApiId: primary.id, cardName: primary.name, setName: primary.set_name, imageUrl: primary.image_url })
  setCtaMsg(res && res.error ? ('Error: ' + (res.error.message || res.error)) : 'Added to watchlist!')
}

const setPageSlug = buildSetSlug(primary.tcg, primary.set_id)
// One Piece EN/JA set_id spellings collapse to the SAME /set/:slug (see the
// ?lang= routing fix, task "risolvere il limite strutturale One Piece
// Japanese") — without an explicit ?lang=ja, /set/:slug defaults to English,
// so a JP card here would silently link to the EN set page. Suffix based on
// `selected` (the record actually shown right now, changes with the language
// pills above), not `primary`, so switching to a JP print also switches the
// Set link. Pokémon JP lives in its own set_id namespace (no collision, see
// lib/tcgSets.js) and already resolves correctly without this — unaffected.
const setLangSuffix = (primary.tcg === 'onepiece' && selected.lang && selected.lang !== 'en') ? `?lang=${encodeURIComponent(selected.lang)}` : ''
const setHref = setPageSlug ? '/set/' + setPageSlug + setLangSuffix : null
const heroImage = selected.image_url_hi || selected.image_url

// Identity row (sez. 1/10): Rarity / Language / Variant del record mostrato.
// Il TCG non e' ripetuto qui: e' gia' visibile e cliccabile nel breadcrumb
// sopra (evita di duplicare un'informazione gia' chiara, sez. 1).
const selectedRarityLabel = (selected.id === primary.id && rarity && rarity.label_en) ? rarity.label_en : selected.rarity
const identityBadges = [
  selectedRarityLabel ? h('span', { style: styles.badge, key: 'rarity' }, selectedRarityLabel) : null,
  selected.lang ? h('span', { style: styles.badge, key: 'lang' }, langLabel(selected.lang)) : null,
  selected.print_variant ? h('span', { style: styles.badge, key: 'variant' }, selected.print_variant) : null,
].filter(Boolean)

// Multilingual switch (sez. 9): un pill per lingua reale disponibile in
// questo canonical group, ognuno porta a un record vero (stesso vincolo di
// print_variant quando possibile, altrimenti il primo trovato in quella
// lingua) — mai una traduzione inventata.
const languagePills = (languages && languages.length > 1)
  ? h('div', { style: styles.pillRow, key: 'langpills' }, languages.map(code => {
      const candidate = variants.find(v => v.lang === code && v.print_variant === selected.print_variant)
        || variants.find(v => v.lang === code)
      const active = selected.lang === code
      return h('button', {
        type: 'button', key: code,
        style: active ? styles.pillActive : styles.pill,
        onClick: () => candidate && setSelectedId(candidate.id),
        disabled: !candidate,
      }, langLabel(code))
    }))
  : null

// Variants section (sez. 5): altre stampe reali nella STESSA lingua di quella
// mostrata (holo/reverse/promo...). Cambio lingua sopra puo' spostare anche
// questa lista, e' voluto: le stampe disponibili possono differire per lingua.
const sameLangVariants = variants.filter(v => v.lang === selected.lang)
const printVariantSection = (sameLangVariants.length > 1) ? h('section', { style: styles.section, key: 'variants' },
  h('h2', { style: styles.h2 }, 'Variants'),
  h('div', { style: styles.variantGrid }, sameLangVariants.map(v => h('button', {
    type: 'button', key: v.id,
    style: v.id === selected.id ? styles.variantCardActive : styles.variantCard,
    onClick: () => setSelectedId(v.id),
  },
    v.image_url ? h('img', { src: v.image_url, alt: v.name, style: styles.variantImg }) : h('div', { style: styles.imgPlaceholderSmall }),
    h('div', { style: styles.muted }, v.print_variant || 'Standard')
  )))
) : null

// Card Information (sez. 6): solo campi realmente presenti sul record
// mostrato/sul canonical group. Niente Type/HP/Stage: non sono colonne
// caricate da cardPageData.js e aggiungerle richiederebbe una query in piu'
// solo per popolare campi che potrebbero restare vuoti per molti tcg — non
// inventato, semplicemente non mostrato finche' il dato non e' gia' in mano.
const infoFacts = [
  { k: 'Card number', v: primary.card_number },
  { k: 'Rarity', v: selectedRarityLabel },
  { k: 'Language', v: selected.lang ? langLabel(selected.lang) : null },
  { k: 'Set', v: displaySetName, href: setHref },
  { k: 'Variant', v: selected.print_variant },
  { k: 'Illustrator', v: primary.illustrator, href: primary.illustrator ? '/illustrator/' + slugifyIllustrator(primary.illustrator) : null },
  { k: 'Series', v: primary.series_name },
  { k: 'Evolves from', v: primary.evolves_from },
].filter(f => f.v)

const infoSection = infoFacts.length ? h('section', { style: styles.section, key: 'info' },
  h('h2', { style: styles.h2 }, 'Card Information'),
  h('div', { style: styles.factGrid }, infoFacts.map(f => h('div', { style: styles.fact, key: f.k },
    h('span', { style: styles.factK }, f.k),
    h('span', { style: styles.factV }, f.href ? h('a', { href: f.href, style: styles.link, className: 'dg-cp-link' }, f.v) : f.v)
  )))
) : null

// Market/Purchase Discovery MVP (2026-08-25): oggi un solo elemento reale
// (eBay, unica integrazione con affiliate tracking effettivamente configurato
// — stessa struttura array introdotta in AssetView.jsx per lo stesso motivo:
// aggiungere TCGplayer/Cardmarket in futuro, una volta che esiste una loro
// registrazione affiliate reale, e' un elemento in piu' in questo array, non
// un rifacimento di questo blocco).
const marketLinks = [
  { key: 'ebay', label: 'Find listings on eBay', href: ebayURL(selected.name || primary.name, displaySetName, 'US', primary.tcg, primary.card_number) },
].filter(l => l.href)

// PREZZO — distinzione esplicita fra prezzo interno (currentPrice, qualunque
// sia la sua fonte reale — vedi priceSourceLabel sopra) e nessun prezzo
// affidabile (fallback onesto verso eBay, mai un valore inventato).
const priceBlock = (currentPrice && currentPrice.price_market != null)
  ? h(Fragment, null,
      h('div', { style: styles.priceLabel }, 'Market price'),
      h('div', { style: styles.priceValue }, formatPrice(currentPrice.price_market, currentPrice.currency)),
      h('div', { style: styles.muted }, priceSourceLabel(currentPrice.source) + (currentPrice.captured_at ? ' · updated ' + new Date(currentPrice.captured_at).toLocaleDateString('en-US') : ''))
      )
  : h(Fragment, null,
      h('div', { style: styles.muted }, 'No market price yet for this card.'),
      h('div', { style: styles.marketLinkRow }, marketLinks.map(l =>
        h('a', { key: l.key, href: l.href, target: '_blank', rel: 'noreferrer', style: styles.btnPrimaryLink, className: 'dg-cp-link' }, l.label + ' ↗')
      ))
      )

const historySection = (priceHistory && priceHistory.length > 1) ? h('section', { style: styles.section, key: 'history' },
                                                                     h('h2', { style: styles.h2 }, 'Price history'),
                                                                     h('div', { style: styles.historyList }, priceHistory.slice(0, 10).map((p, i) => h('div', { style: styles.historyRow, key: i },
                                                                                                                                                       h('span', null, p.captured_at ? new Date(p.captured_at).toLocaleDateString('en-US') : '—'),
                                                                                                                                                       h('span', null, formatPrice(p.price_market, p.currency) || '—')
                                                                                                                                                       )))
                                                                     ) : null

// eBay SOLD AVERAGE (Market/Purchase Discovery MVP) — dati "osservati" reali,
// distinti dal prezzo interno sopra (sezione a parte, etichetta esplicita
// "eBay sold · avg price"). Nessun gating per piano: PRODUCT_SPEC.md §6, i
// piani "non gatekeepano nulla" oggi — mostrate tutte le finestre realmente
// presenti, nessuna inventata per quelle assenti.
const soldTfOrder = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']]
const soldRowsPresent = soldTfOrder.filter(([tf]) => soldByTimeframe[tf])
const soldSection = soldRowsPresent.length ? h('section', { style: styles.section, key: 'sold' },
  h('h2', { style: styles.h2 }, 'eBay sold · avg price'),
  h('div', { style: styles.historyList }, soldRowsPresent.map(([tf, label]) => {
    const row = soldByTimeframe[tf]
    return h('div', { style: styles.historyRow, key: tf },
      h('span', null, label),
      h('span', null, formatPrice(row.price_market, row.currency) || '—'),
      h('span', { style: styles.muted }, row.count != null ? row.count + ' sales' : '')
    )
  }))
) : null

// eBay LIVE (Market/Purchase Discovery MVP) — listing reali via lo stesso
// endpoint /api/ebay-search già usato da AssetView.jsx, nascosta se zero match
// (mai una lista vuota mostrata come se fosse un risultato).
const ebayLiveSection = ebayItems.length > 0 ? h('section', { style: styles.section, key: 'ebay-live' },
  h('h2', { style: styles.h2 }, 'eBay live listings'),
  h('div', { style: styles.historyList }, ebayItems.map((it, i) =>
    // Data Completeness / UX Holes (2026-08-25, mobile check): real eBay
    // listing titles can be long — historyRow (used above for date/price
    // rows, both short) has no wrap handling, so a long title would push a
    // narrow viewport into horizontal overflow. Own row style: title
    // truncates with ellipsis instead, price stays fixed-width and visible.
    h('a', { key: i, href: ebayItemURL(it.url, 'US'), target: '_blank', rel: 'noreferrer', style: styles.ebayLiveRow, className: 'dg-cp-link' },
      h('span', { style: styles.ebayLiveTitle }, it.title),
      h('span', { style: styles.ebayLivePrice }, (it.currency === 'EUR' ? '€' : it.currency === 'GBP' ? '£' : '$') + Number(it.price).toFixed(2))
    )
  )),
  marketLinks[0] ? h('a', { href: marketLinks[0].href, target: '_blank', rel: 'noreferrer', style: styles.setLink, className: 'dg-cp-link' }, 'See all on eBay →') : null
) : null

// Academy (sez. 7): stesso link gia' introdotto in Task 5, ora una sezione
// dedicata invece di una riga persa tra i meta. Card Anatomy e' la seconda
// lezione: relazione reale e semplice con "Card Information" appena sopra
// (stessa materia: come leggere i campi di una carta), non una recommendation.
const academySection = h('section', { style: styles.section, key: 'academy' },
  h('h2', { style: styles.h2 }, 'Learn'),
  h('div', { style: styles.academyLinks },
    h('a', { href: '/academy/rarity-variants', style: styles.link, className: 'dg-cp-link' }, 'Rarity & Variants — what these labels mean →'),
    h('a', { href: '/academy/card-anatomy', style: styles.link, className: 'dg-cp-link' }, 'Card Anatomy — how to read a card →')
  )
)

// Related cards (sez. 8): priorita' 1/2 (stessa carta in altra lingua/stampa)
// sono gia' coperte sopra dai pill lingua/variant — sono record dello STESSO
// canonical group, quindi la STESSA pagina, non una lista "related" separata.
// Qui resta la priorita' 3 (altre carte dello stesso set), gia' caricata da
// cardPageData.js (sameSetCards) senza query aggiuntive.
const relatedSection = (sameSetCards && sameSetCards.length > 0) ? h('section', { style: styles.section, key: 'related' },
  h('h2', { style: styles.h2 }, 'Related cards'),
  h('div', { style: styles.relatedGrid }, sameSetCards.map(c => {
    const slug2 = c.slug
    const tag = slug2 ? 'a' : 'div'
    const props = { style: styles.relatedCard, key: c.id, className: slug2 ? 'dg-cp-link' : undefined }
    if (slug2) props.href = '/carta/' + slug2
    return h(tag, props,
             c.image_url ? h('img', { src: c.image_url, alt: c.name, style: styles.relatedImg }) : h('div', { style: styles.imgPlaceholderSmall }),
             h('div', { style: styles.relatedName }, c.name),
             h('div', { style: styles.muted }, '#' + c.card_number)
             )
  })),
  setHref ? h('a', { href: setHref, style: styles.setLink, className: 'dg-cp-link' }, 'View full set →') : null
) : null

// Collection CTA (sez. 2/11): riusa add_or_increment_collection /
// decrement_or_remove_collection (Task A), nessuna seconda implementazione
// RPC. Copre esplicitamente logged-out / loading / not collected / N copie.
const authLoading = authStatus === 'loading'
let collectionCta
if (authLoading) {
  collectionCta = h('button', { style: styles.btnPrimary, disabled: true, key: 'cta' }, '…')
} else if (!isAuthed) {
  collectionCta = h('div', { key: 'cta' },
    h('a', { href: '/login', style: styles.btnPrimaryLink, className: 'dg-cp-link' }, '+ Add to Collection'),
    h('p', { style: styles.mutedSmall }, 'Sign in to track this card in your collection.')
  )
} else if (qtyLoading) {
  collectionCta = h('button', { style: styles.btnPrimary, disabled: true, key: 'cta' }, 'Checking your collection…')
} else if (myQty > 0) {
  collectionCta = h('div', { style: styles.qtyBox, key: 'cta' },
    h('span', { style: styles.collectionLabel }, `Collected ×${myQty}`),
    h('div', { style: styles.qtyRow },
      h('button', { type: 'button', style: styles.qtyBtn, onClick: handleDecrementCollection, disabled: decrementBusy, 'aria-label': 'Remove one copy from collection' }, decrementBusy ? '…' : '−'),
      h('span', { style: styles.qtyValue }, myQty),
      h('button', { type: 'button', style: styles.qtyBtn, onClick: handleAddCollection, disabled: collectBusy, 'aria-label': 'Add another copy to collection' }, collectBusy ? '…' : '+')
    )
  )
} else {
  collectionCta = h('button', { style: styles.btnPrimary, onClick: handleAddCollection, disabled: collectBusy, key: 'cta' }, collectBusy ? 'Adding…' : '+ Add to Collection')
}

const tcgHubInfo = getTcgHub(primary.tcg)
return h('div', { style: styles.page },
         h('style', null, CARD_LINK_CSS),
         h('div', { style: styles.wrap },
           h('a', { href: '/', style: styles.backLink }, '← DraGold'),
           // Block 6 - TCG Hub SEO Foundation: breadcrumb visibile Card -> Set -> TCG,
           // stesso pattern gia' usato in SetPage.jsx/TcgPage.jsx.
           h('nav', { style: styles.breadcrumb, 'aria-label': 'breadcrumb' },
             h('a', { href: '/', style: styles.breadcrumbLink, className: 'dg-cp-link' }, 'DraGold'),
             tcgHubInfo ? h('span', null, ' / ') : null,
             tcgHubInfo ? h('a', { href: '/' + primary.tcg, style: styles.breadcrumbLink, className: 'dg-cp-link' }, tcgHubInfo.label) : null,
             // Card -> Set link (Explorer/Set-Experience feature): a real,
             // clearly-clickable <a> to /set/:slug — same element that already
             // existed here, now with an explicit hover/focus style (dg-cp-link,
             // below) instead of relying on the browser's implicit default.
             setHref ? h('span', null, ' / ') : null,
             setHref ? h('a', { href: setHref, style: styles.breadcrumbLink, className: 'dg-cp-link' }, displaySetName) : null
           ),
           h('div', { style: styles.hero },
             h('div', { style: styles.imgWrap },
               heroImage ? h('img', { src: heroImage, alt: selected.name || primary.name, style: styles.img }) : h('div', { style: styles.imgPlaceholder }, 'Image not available')
               ),
             h('div', { style: styles.info },
               h('h1', { style: styles.h1 }, displayName),
               h('p', { style: styles.subtitle },
                 setHref ? h('a', { href: setHref, style: styles.subtitleLink, className: 'dg-cp-link' }, displaySetName) : displaySetName,
                 ' · #' + primary.card_number
                 ),
               h('div', { style: styles.badges }, identityBadges),
               languagePills,
               h('div', { style: styles.collectionBox }, collectionCta),
               ctaMsg ? h('p', { style: styles.muted }, ctaMsg) : null,
               h('div', { style: styles.priceBox }, priceBlock),
               h('button', { type: 'button', style: styles.btnGhostSmall, onClick: handleAddWatchlist }, '+ Add to Watchlist')
               )
             ),
           infoSection,
           printVariantSection,
           historySection,
           soldSection,
           ebayLiveSection,
           academySection,
           relatedSection
           )
         )
}


const CARD_LINK_CSS = `
.dg-cp-link:hover{text-decoration:underline;}
.dg-cp-link:focus-visible{outline:2px solid #fbbf24;outline-offset:2px;border-radius:3px;}
`

const styles = {
  page: { minHeight: '100vh', background: '#020208', color: '#f4f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 960, margin: '0 auto' },
  center: { textAlign: 'center', padding: '80px 16px' },
  backLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 12 },
  breadcrumb: { fontSize: 13, color: '#888', marginBottom: 24 },
  breadcrumbLink: { color: '#9aa0ff', textDecoration: 'none' },
  hero: { display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 40 },
  imgWrap: { flex: '0 0 280px', maxWidth: 280 },
  img: { width: '100%', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  imgPlaceholder: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13, textAlign: 'center', padding: 16 },
  imgPlaceholderSmall: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 8 },
  info: { flex: '1 1 320px', minWidth: 280 },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 12px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: '0 0 16px', fontSize: 15 },
  subtitleLink: { color: '#a0a0b0', textDecoration: 'underline', textDecorationColor: '#3a3a4a' },
  badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  badge: { background: '#1a1a28', border: '1px solid #2a2a3a', borderRadius: 20, padding: '4px 12px', fontSize: 12 },
  badgeActive: { background: '#4b3cff', border: '1px solid #4b3cff', borderRadius: 20, padding: '4px 12px', fontSize: 12 },
  pillRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  pill: { background: 'transparent', color: '#c0c0d0', border: '1px solid #2a2a3a', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  pillActive: { background: '#4b3cff', color: '#fff', border: '1px solid #4b3cff', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'default', fontFamily: 'inherit' },
  collectionBox: { marginBottom: 12 },
  collectionLabel: { fontSize: 13, color: '#a0a0b0', fontWeight: 600 },
  qtyBox: { background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: '12px 16px', display: 'inline-flex', flexDirection: 'column', gap: 8 },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 14 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, border: '1px solid #3a3a4a', background: 'transparent', color: '#f4f4f8', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
  qtyValue: { fontSize: 18, fontWeight: 700, minWidth: 20, textAlign: 'center' },
  priceBox: { background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: 16, marginBottom: 16, marginTop: 4 },
  priceLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  priceValue: { fontSize: 28, fontWeight: 700 },
  marketLinkRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  meta: { fontSize: 14, color: '#c0c0d0', margin: '4px 0' },
  muted: { color: '#777', fontSize: 13 },
  mutedSmall: { color: '#777', fontSize: 12, margin: '6px 0 0' },
  btnPrimary: { background: '#4b3cff', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
  btnPrimaryLink: { display: 'inline-block', background: '#4b3cff', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, textDecoration: 'none' },
  btnGhostSmall: { background: 'transparent', color: '#9aa0ff', border: 'none', fontSize: 13, cursor: 'pointer', padding: 0, marginTop: 4, fontFamily: 'inherit', textDecoration: 'underline' },
  section: { marginBottom: 36, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  historyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  historyRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #14141f', fontSize: 14 },
  ebayLiveRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #14141f', fontSize: 14, minWidth: 0 },
  ebayLiveTitle: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ebayLivePrice: { flex: '0 0 auto', fontWeight: 600 },
  factGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  factK: { fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '0.03em' },
  factV: { fontSize: 14, color: '#f4f4f8' },
  variantGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 },
  variantCard: { textAlign: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' },
  variantCardActive: { textAlign: 'center', background: 'transparent', border: '2px solid #4b3cff', borderRadius: 8, padding: 4, cursor: 'default', color: 'inherit', fontFamily: 'inherit' },
  variantImg: { width: '100%', borderRadius: 8, marginBottom: 6 },
  academyLinks: { display: 'flex', flexDirection: 'column', gap: 8 },
  relatedGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 14 },
  relatedCard: { textDecoration: 'none', color: 'inherit', display: 'block' },
  relatedImg: { width: '100%', borderRadius: 8, marginBottom: 6 },
  relatedName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  link: { color: '#9aa0ff' },
  setLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginLeft: 12, display: 'inline-block', marginTop: 12 },
}
