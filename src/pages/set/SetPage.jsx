// DraGold - Public Set Page (Block 5, SEO Foundation for Sets)
// Componente isolato, stesso pattern di CardPage.jsx: DraGold.jsx/main.jsx fa
// solo routing verso questa pagina. /set/{slug} e' la URL SEO pubblica del Set,
// entita' intermedia del Knowledge Graph TCG -> Set -> Canonical Card -> Print/lang.
//
// Task 7 (Set Page UX/Completion Journey): aggiunge completion metric,
// indicatore collected/quantity per carta, filtro All/Collected/Missing e
// set precedente/successivo — tutto sopra ai dati gia' caricati da
// getSetPageData()/una singola query batched per la Collection, mai per-card.
//
// Explicit-language routing (task "risolvere il limite strutturale One Piece
// Japanese", 2026-08-25): lo slug da solo non basta a distinguere le edizioni
// EN/JA di uno stesso set quando collidono sotto normalizeSetKey (es. One
// Piece "OP01"/"OP-01" — vedi lib/setSlug.js). Soluzione scelta, la piu'
// minima compatibile con gli URL esistenti: un query param `?lang=`, letto
// qui da window.location.search e passato a getSetPageData(). Assente ->
// comportamento originale invariato (EN, poi qualunque lingua disponibile —
// questo e' gia' cio' che rendeva i set Pokemon JP-only navigabili prima di
// questo task, dato che il loro set_id namespace non collide mai con EN).
// Esplicito (?lang=ja) -> filtro rigido: se quella lingua non esiste per
// questo set, niente fallback silenzioso a un'altra (vedi ramo
// langUnavailable sotto) — mai carte della lingua sbagliata sotto
// un'etichetta che dice il contrario.
import { getSetPageData, getAdjacentSets } from './setPageData.js'
import { getTcgHub } from '../../lib/tcgConfig.js'
import { buildSetSlug } from '../../lib/setSlug.js'
import { useAuth } from '../../lib/auth.js'
import { supabase } from '../../supabase.js'
import { useEffect, useState, createElement as h } from 'react'

// Solo un codice lingua plausibile (2-8 lettere/trattini, es. "ja", "zh-tw")
// viene onorato — qualunque altra cosa nel query param e' ignorata invece di
// essere passata a supabase come filtro .eq('lang', ...) as-is.
function readRequestedLang() {
  try {
    const raw = new URLSearchParams(window.location.search).get('lang')
    const v = (raw || '').trim().toLowerCase()
    return /^[a-z]{2}(-[a-z]{2,4})?$/.test(v) ? v : null
  } catch { return null }
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
  setMeta('meta[property="og:type"]', 'og:type', true, 'website')
  setMeta('meta[name="twitter:card"]', 'twitter:card', false, image ? 'summary_large_image' : 'summary')
}

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
  let el = document.getElementById('ld-set')
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = 'ld-set'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

export default function SetPage({ slug }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  // Task 7 — stato Collection dell'utente per le carte di QUESTO set: una sola
  // query batched (collection.card_api_id IN [...]) invece di una per carta.
  const [collectionMap, setCollectionMap] = useState(new Map())
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'collected' | 'missing'
  const [adjacent, setAdjacent] = useState(null)
  const { status: authStatus, isAuthed } = useAuth()
  const lang = readRequestedLang()

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    setFilter('all')
    setAdjacent(null)
    getSetPageData(slug, lang).then(data => {
      if (!alive) return
      if (!data) { setState({ loading: false, data: null, error: 'not_found' }); return }
      setState({ loading: false, data, error: null })
    }).catch(err => {
      if (!alive) return
      setState({ loading: false, data: null, error: err.message || 'error' })
    })
    return () => { alive = false }
  }, [slug, lang])

  useEffect(() => {
    const d = state.data
    if (!d) return
    const hub = getTcgHub(d.tcg)
    const tcgLabel = hub?.label || d.tcg
    const langQuery = d.langRequested ? `?lang=${encodeURIComponent(d.langRequested)}` : ''
    const setUrl = `https://dragold.org/set/${d.slug}${langQuery}`

    // Lingua richiesta esplicitamente ma genuinamente assente per questo set
    // (vedi setPageData.js) — non e' un 404 generico (il set esiste, questa
    // edizione no), ma non e' nemmeno contenuto reale da indicizzare: noindex,
    // canonical verso l'edizione di base (quella che esiste davvero).
    if (d.langUnavailable) {
      setRobotsMeta('noindex')
      setSeoMeta({
        title: `${d.setName} — DraGold`,
        description: `This set doesn't have a ${d.langRequested.toUpperCase()} edition indexed on DraGold yet.`,
        image: null,
        url: `https://dragold.org/set/${d.slug}`,
      })
      return
    }

    const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`
    const langNote = d.langUsed === 'ja' ? ' Japanese edition.' : ''
    setRobotsMeta(null)
    setSeoMeta({
      title: `${d.setName}${d.langUsed === 'ja' ? ' (Japanese)' : ''} (${tcgLabel}) — Set Guide & Card List — DraGold`,
      description: `${d.setName} is a ${tcgLabel} set${d.releaseDate ? ` released ${d.releaseDate}` : ''} with ${countTxt}.${langNote} Browse every card, rarity and variant, and track this set in your collection on DraGold.`,
      image: d.logoUrl || null,
      url: setUrl,
    })

    // BreadcrumbList: DraGold -> TCG -> Set (3 livelli, ora che /{tcg} esiste
    // davvero — Block 6). hubUrl e' una URL reale, non inventata.
    const hubUrl = `https://dragold.org/${d.tcg}`
    const graph = [{
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
        { '@type': 'ListItem', position: 2, name: tcgLabel, item: hubUrl },
        { '@type': 'ListItem', position: 3, name: d.setName, item: setUrl },
      ],
    }]
    if (d.logoUrl) graph.push({ '@type': 'ImageObject', contentUrl: d.logoUrl, url: d.logoUrl })
    graph.push({
      '@type': 'CollectionPage',
      name: `${d.setName} — ${tcgLabel}`,
      description: `${tcgLabel} set ${d.setName}${d.releaseDate ? `, released ${d.releaseDate}` : ''}.`,
      url: setUrl,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: d.cardCount,
        itemListElement: d.cards.slice(0, 60).filter(c => c.cardSlug).map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          url: `https://dragold.org/carta/${c.cardSlug}`,
        })),
      },
    })
    setJsonLd({ '@context': 'https://schema.org', '@graph': graph })
  }, [state.data])

  // Task 7 — Collection reale dell'utente per le carte di questo set: una
  // sola query batched (card_api_id IN [...ids di questa pagina]), RLS scoped
  // ad auth.uid() come ovunque nell'app (nessun filtro utente esplicito
  // necessario). Se l'utente non e' autenticato, nessuna query e nessun
  // progresso simulato: la mappa resta vuota. Niente da fare per lo stato
  // langUnavailable (d.cards non esiste in quel caso).
  useEffect(() => {
    const d = state.data
    if (!d || !d.cards || !isAuthed) { setCollectionMap(new Map()); return }
    let cancelled = false
    setCollectionLoading(true)
    const ids = d.cards.map(c => c.id)
    supabase.from('collection').select('card_api_id, quantity').in('card_api_id', ids)
      .then(({ data }) => {
        if (cancelled) return
        const m = new Map()
        for (const row of (data || [])) m.set(row.card_api_id, row.quantity || 0)
        setCollectionMap(m)
      })
      .catch(() => { if (!cancelled) setCollectionMap(new Map()) })
      .finally(() => { if (!cancelled) setCollectionLoading(false) })
    return () => { cancelled = true }
  }, [isAuthed, state.data])

  // Task 7 — set precedente/successivo, solo quando questo set ha una vera
  // release_date (set_logos): senza una data reale non c'e' un ordine da cui
  // derivarlo. Query leggera separata (set_logos e' una tabella piccola).
  useEffect(() => {
    const d = state.data
    if (!d || !d.releaseDate) { setAdjacent(null); return }
    let cancelled = false
    getAdjacentSets(d.tcg, d.setId).then(res => { if (!cancelled) setAdjacent(res) }).catch(() => { if (!cancelled) setAdjacent(null) })
    return () => { cancelled = true }
  }, [state.data && state.data.setId])

  if (state.loading) {
    return h('div', { style: styles.page }, h('div', { style: styles.wrap },
      h('div', { className: 'skel-card', style: { display: 'flex', flexDirection: 'column', gap: 14, background: 'transparent', border: 'none', padding: 0 } },
        h('div', { className: 'skel-line', style: { height: 32, width: '50%' } }),
        h('div', { className: 'skel-line w40' }),
      )
    ))
  }

  if (state.error || !state.data) {
    // Nessuna vera SSR/status code lato client (stesso limite architetturale gia'
    // documentato per CardPage.jsx, vedi vercel.json rewrite catch-all): noindex e'
    // il minimo compatibile per evitare un "soft 404" indicizzabile. Il vero HTTP 404
    // per i crawler e' gestito da middleware.js (vedi ramo bot esteso a /set/:slug).
    setRobotsMeta('noindex')
    return h('div', { style: styles.page }, h('div', { style: styles.center },
      h('h1', { style: styles.h1 }, 'Set not found'),
      h('p', { style: styles.muted }, 'This set is not yet available on DraGold.'),
      h('a', { href: '/', style: styles.link }, 'Back to home')
    ))
  }

  // Lingua esplicitamente richiesta ma assente per questo set (vedi
  // setPageData.js/langUnavailable) — il set e' reale, questa edizione no.
  // Stato dedicato invece di un 404 generico o di mostrare silenziosamente
  // le carte di un'altra lingua sotto questa etichetta.
  if (state.data.langUnavailable) {
    const ld = state.data
    return h('div', { style: styles.page }, h('div', { style: styles.wrap },
      h('a', { href: '/', style: styles.backLink }, '← DraGold'),
      h('div', { style: styles.center },
        h('h1', { style: styles.h1 }, ld.setName),
        h('p', { style: styles.muted }, `This set doesn't have a ${ld.langRequested.toUpperCase()} edition indexed on DraGold yet.`),
        h('a', { href: '/set/' + ld.slug, style: styles.link }, 'View the available edition')
      )
    ))
  }

  const d = state.data
  const hub = getTcgHub(d.tcg)
  const tcgLabel = hub?.label || d.tcg
  const releaseYear = d.releaseDate ? new Date(d.releaseDate).getFullYear() : null
  const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`
  // Query string da propagare ai link "same series"/adjacenti quando questa
  // pagina e' esplicitamente un'edizione non-EN — mai inventata per un
  // vicino che potrebbe non averla (vedi adjacentSection sotto: se non ce
  // l'ha, l'utente atterra sullo stato langUnavailable onesto, non su un
  // fallback silenzioso a EN).
  const langQuerySuffix = d.langUsed && d.langUsed !== 'en' ? `?lang=${encodeURIComponent(d.langUsed)}` : ''

  // Task 7 — completion metric: conteggio sulle carte realmente caricate in
  // questa pagina (d.cards, gia' deduplicate per canonical group). Quando
  // hasMore=true il totale e' un campione (LISTING_CAP=400), non l'intero
  // set: la percentuale in quel caso sarebbe fuorviante, quindi non viene
  // mostrata — solo il conteggio grezzo, con l'avviso esplicito.
  const collectedCount = d.cards.reduce((n, c) => n + ((collectionMap.get(c.id) || 0) > 0 ? 1 : 0), 0)
  const completionPct = (!d.hasMore && d.cardCount > 0) ? Math.round((collectedCount / d.cardCount) * 100) : null

  const visibleCards = (!isAuthed || filter === 'all')
    ? d.cards
    : filter === 'collected'
      ? d.cards.filter(c => (collectionMap.get(c.id) || 0) > 0)
      : d.cards.filter(c => !(collectionMap.get(c.id) || 0))

  const completionSection = !isAuthed
    ? h('div', { style: styles.completionBox },
        h('div', { style: styles.completionLabel }, `${countTxt} in this set`),
        h('a', { href: '/login', style: styles.btnPrimaryLink, className: 'dg-set-link' }, 'Sign in to track your progress')
      )
    : collectionLoading
      ? h('div', { style: styles.completionBox }, h('div', { style: styles.muted }, 'Checking your collection…'))
      : completionPct != null
        ? h('div', { style: styles.completionBox },
            h('div', { style: styles.completionLabel }, `${collectedCount} / ${d.cardCount} cards collected (${completionPct}%)`),
            h('div', { style: styles.progressTrack }, h('div', { style: { ...styles.progressFill, width: completionPct + '%' } }))
          )
        : h('div', { style: styles.completionBox },
            h('div', { style: styles.completionLabel }, `${collectedCount} collected so far (showing first ${d.cardCount} of this large set)`)
          )

  const filterRow = (isAuthed && !collectionLoading) ? h('div', { style: styles.filterRow }, [
    ['all', 'All'], ['collected', 'Collected'], ['missing', 'Missing'],
  ].map(([key, label]) => h('button', {
    type: 'button', key, style: filter === key ? styles.filterBtnActive : styles.filterBtn,
    onClick: () => setFilter(key),
  }, label))) : null

  const cardGrid = visibleCards.length
    ? h('div', { style: styles.grid }, visibleCards.map(c => {
        const tag = c.cardSlug ? 'a' : 'div'
        const props = { style: styles.cardTile, key: c.id, className: c.cardSlug ? 'dg-card-tile' : undefined }
        // E2E fix (bug #1/#2, preview 09585cc): propaga la lingua reale della
        // riga cliccata alla Card Page via ?lang=, cosi' cardPageData.js puo'
        // (a) disambiguare uno slug canonical_cards ambiguo (caso reale
        // verificato: due gruppi diversi con lo stesso slug "pokemon-sv10-001",
        // uno EN uno JA-only) e (b) aprire subito la stampa nella lingua da cui
        // si e' partiti invece di ripiegare sempre su English. c.lang e' un
        // dato reale gia' caricato da questa stessa query, non un'euristica.
        if (c.cardSlug) props.href = '/carta/' + c.cardSlug + (c.lang ? '?lang=' + encodeURIComponent(c.lang) : '')
        const img = c.image_url_hi || c.image_url
        const qty = collectionMap.get(c.id) || 0
        const otherLangs = (c.variantLangs || []).filter(l => l !== c.lang)
        return h(tag, props,
          h('div', { style: styles.cardImgWrap },
            img ? h('img', { src: img, alt: c.name, style: styles.cardImg, loading: 'lazy' }) : h('div', { style: styles.cardImgPh }),
            qty > 0 ? h('span', { style: styles.qtyBadge }, `×${qty}`) : null
          ),
          h('div', { style: styles.cardName }, c.name),
          h('div', { style: styles.muted }, '#' + c.card_number, c.rarity ? ' · ' + c.rarity : ''),
          otherLangs.length ? h('div', { style: styles.variantTag }, 'Also: ' + otherLangs.join(', ').toUpperCase()) : null
        )
      }))
    : h('p', { style: styles.muted }, isAuthed && filter !== 'all'
        ? (filter === 'collected' ? 'No cards from this set in your collection yet.' : 'You already collected every card shown here.')
        : 'No cards indexed for this set yet.')

  // Task 7 — set precedente/successivo, solo se davvero risolti (release_date
  // reale su entrambi i lati, mai un ordine indovinato). set_logos non ha una
  // dimensione lingua, quindi la sequenza prev/next resta quella "ufficiale"
  // (International) per costruzione — non esiste un dato di adiacenza
  // per-lingua da rispettare qui senza inventarlo. Quando questa pagina e'
  // un'edizione non-EN, i link portano comunque alla STESSA lingua
  // (langQuerySuffix): se il vicino non ha quell'edizione, l'utente atterra
  // sullo stato langUnavailable onesto invece di essere riportato a EN senza
  // preavviso.
  const adjacentSection = (adjacent && (adjacent.prev || adjacent.next)) ? h('section', { style: styles.section },
    h('h2', { style: styles.h2 }, 'More in this series'),
    h('div', { style: styles.adjacentRow },
      adjacent.prev ? h('a', { href: '/set/' + buildSetSlug(d.tcg, adjacent.prev.set_code) + langQuerySuffix, style: styles.adjacentCard, className: 'dg-set-link' },
        h('div', { style: styles.muted }, '← Previous'),
        h('div', null, adjacent.prev.set_name)
      ) : null,
      adjacent.next ? h('a', { href: '/set/' + buildSetSlug(d.tcg, adjacent.next.set_code) + langQuerySuffix, style: styles.adjacentCard, className: 'dg-set-link' },
        h('div', { style: styles.muted }, 'Next →'),
        h('div', null, adjacent.next.set_name)
      ) : null,
    )
  ) : null

  return h('div', { style: styles.page },
    h('style', null, TILE_CSS),
    h('div', { style: styles.wrap },
      h('a', { href: '/', style: styles.backLink }, '← DraGold'),
      // Breadcrumb "DraGold > TCG > Set" — the requested "Explorer > TCG > Set"
      // trail: DraGold has no separate /explorer route today (Explore is an
      // in-app tab, see pages/sets/SetsView.jsx), so the root crumb stays
      // "DraGold" -> "/" rather than pointing at a route that doesn't exist.
      h('nav', { style: styles.breadcrumb, 'aria-label': 'breadcrumb' },
        h('a', { href: '/', style: styles.breadcrumbLink, className: 'dg-set-link' }, 'DraGold'),
        h('span', null, ' / '),
        h('a', { href: '/' + d.tcg, style: styles.breadcrumbLink, className: 'dg-set-link' }, tcgLabel),
        h('span', null, ' / '),
        h('span', { style: styles.breadcrumbCurrent }, d.setName + (d.langUsed === 'ja' ? ' (Japanese)' : ''))
      ),
      h('div', { style: styles.head },
        // Data Completeness / UX Holes (2026-08-25): onError used to just hide
        // the broken <img>, leaving blank space — a real gap when a logoUrl
        // "loads" but resolves to 0x0 (One Piece's hotlink-protected official
        // logos, same case already handled in Explore/Set Detail's SetTile).
        // Same DOM-toggle fallback TcgPage.jsx already uses for this exact
        // case (no React state needed here, consistent with that file's
        // approach), so Explore -> Set / TCG -> Set / Set Detail / this SEO
        // page all resolve to the same visible outcome now.
        d.logoUrl
          ? h('div', { style: { position: 'relative' } },
              h('img', { src: d.logoUrl, alt: d.setName, style: styles.logo, onError: e => {
                e.currentTarget.style.display = 'none'
                if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex'
              } }),
              h('div', { style: { ...styles.logoFallback, display: 'none' } }, d.setId)
            )
          : h('div', { style: styles.logoFallback }, d.setId),
        h('div', null,
          hub?.logo ? h('img', { src: hub.logo, alt: '', style: styles.hubBadge }) : null,
          h('h1', { style: styles.h1 }, d.setName),
          h('p', { style: styles.subtitle },
            tcgLabel,
            ' · ', d.setId,
            d.releaseDate ? ` · Released ${formatDate(d.releaseDate)}` : '',
            releaseYear ? ` (${releaseYear})` : '',
            d.seriesName ? ` · ${d.seriesName} series` : '',
            d.langUsed === 'ja' ? ' · Japanese edition' : d.langUsed === null ? ' · showing all available languages' : ''
          )
        )
      ),
      completionSection,
      h('section', { style: styles.section },
        h('h2', { style: styles.h2 }, 'Cards in this set'),
        filterRow,
        cardGrid,
        h('p', { style: { ...styles.muted, marginTop: 16 } },
          h('a', { href: '/academy/tcg-basics', style: styles.link, className: 'dg-set-link' }, 'Learn: Card, Set, Release & Variant')
        )
      ),
      adjacentSection
    )
  )
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return iso }
}

const TILE_CSS = `
.dg-set-link:hover{text-decoration:underline;}
.dg-set-link:focus-visible{outline:2px solid #fbbf24;outline-offset:2px;border-radius:3px;}
.dg-card-tile{transition:transform .15s ease;}
.dg-card-tile:hover{transform:translateY(-2px);}
.dg-card-tile:focus-visible{outline:2px solid #fbbf24;outline-offset:2px;}
`

const styles = {
  page: { minHeight: '100vh', background: '#020208', color: '#f4f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 1100, margin: '0 auto' },
  center: { textAlign: 'center', padding: '80px 16px' },
  backLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 16 },
  breadcrumb: { fontSize: 13, color: '#888', marginBottom: 24 },
  breadcrumbLink: { color: '#9aa0ff', textDecoration: 'none' },
  breadcrumbCurrent: { color: '#c0c0d0' },
  head: { display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
  logo: { maxHeight: 64, maxWidth: 220, objectFit: 'contain' },
  logoFallback: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64, minWidth: 120, padding: '0 16px', border: '1px dashed currentColor', borderRadius: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.04em', opacity: .85, color: '#9aa0ff' },
  hubBadge: { height: 16, marginBottom: 6, opacity: .8, display: 'block' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 16px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: 0, fontSize: 14 },
  section: { marginTop: 20, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  completionBox: { background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: 16, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' },
  completionLabel: { fontSize: 14, fontWeight: 600, color: '#f4f4f8' },
  progressTrack: { width: '100%', maxWidth: 320, height: 8, borderRadius: 4, background: '#1a1a28', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#4b3cff', borderRadius: 4 },
  btnPrimaryLink: { display: 'inline-block', background: '#4b3cff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16 },
  filterBtn: { background: 'transparent', color: '#c0c0d0', border: '1px solid #2a2a3a', borderRadius: 20, padding: '4px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  filterBtnActive: { background: '#4b3cff', color: '#fff', border: '1px solid #4b3cff', borderRadius: 20, padding: '4px 14px', fontSize: 12, cursor: 'default', fontFamily: 'inherit' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 },
  cardTile: { textDecoration: 'none', color: 'inherit', display: 'block', borderRadius: 8 },
  cardImgWrap: { position: 'relative', marginBottom: 6 },
  cardImg: { width: '100%', borderRadius: 8, aspectRatio: '3/4', objectFit: 'cover', display: 'block' },
  cardImgPh: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 8 },
  qtyBadge: { position: 'absolute', top: 6, right: 6, background: '#4b3cff', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 12, padding: '2px 7px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' },
  cardName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  variantTag: { color: '#7a7ae0', fontSize: 11, marginTop: 2 },
  adjacentRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  adjacentCard: { flex: '1 1 200px', textDecoration: 'none', color: 'inherit', background: '#0f0f18', border: '1px solid #23233a', borderRadius: 10, padding: 12 },
  muted: { color: '#777', fontSize: 13 },
  link: { color: '#9aa0ff' },
}
