// DraGold - Public TCG Hub Page (Block 6, TCG Hub SEO Foundation)
// Componente isolato, stesso pattern di CardPage.jsx/SetPage.jsx: main.jsx fa
// solo routing verso questa pagina. /{tcg} e' la URL SEO pubblica del TCG,
// livello piu' alto del Knowledge Graph TCG -> Set -> Canonical Card -> Print/lang.
// Discovery + SEO + navigazione: NIENTE market dashboard, prezzi aggregati,
// grafici, portfolio.
//
// International/Japanese (Explorer + Catalog Completeness follow-up,
// 2026-08-25): stessa logica gia' verificata e usata da pages/sets/SetsView.jsx
// (Explorer in-app) — riusata qui, non riscritta. detectJapaneseSets(tcg) e'
// l'unica query in piu' sul load iniziale (un .limit(1)), e SOLO per i tcg che
// risultano avere davvero righe ja (pokemon/onepiece, verificato live — mtg/ygo
// sono 100% 'en', mai una sezione Japanese vuota). Il carico "Japanese" resta
// lazy dietro un bottone, come in Explorer (requisito: niente query aggiuntive
// sul load iniziale che possano essere lazy).
//
// Per i tcg con dati ja reali, la lista "International" passa da
// getTcgPageData()/computeTcgSets() (che per One Piece somma le righe cards
// senza filtro lingua — verificato su Supabase: canonical_cards.set_id e' NULL
// al 100% per onepiece, quindi cade sul fallback `cards` non filtrato, e
// conterebbe en+ja insieme sotto lo stesso set) a loadLangSets(tcg,'en') —
// stessa funzione usata per la sezione Japanese, stavolta con lang='en': conteggi
// e identita' di set correttamente scoped a una sola lingua per volta, mai
// mescolati. Per mtg/ygo (nessun dato ja) il path resta quello originale,
// invariato: zero rischio, zero query in piu'.
//
// Set Detail routing (follow-up task, 2026-08-25): /set/:slug previously had
// no language dimension, and for One Piece the EN/JA slugs collide under
// normalizeSetKey() (OP01/OP-01) — setPageData.js used to always resolve to
// 'en', so a Japanese tile here used to render without a link (see git
// history) rather than silently opening the English card list. SetPage.jsx/
// setPageData.js now accept an explicit `?lang=` query param that scopes the
// Set Detail to one language with no silent fallback, so every tile below
// links normally again — Japanese tiles just carry `?lang=ja` (only added
// when a set's `.lang` isn't the default 'en'; International tiles are
// unaffected, same bare /set/:slug as before).
import { getTcgPageData } from './tcgPageData.js'
import { getTcgHub } from '../../lib/tcgConfig.js'
import { loadLangSets, detectJapaneseSets } from '../../lib/tcgSets.js'
import { useEffect, useState, createElement as h } from 'react'

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
  let el = document.getElementById('ld-tcg')
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = 'ld-tcg'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

export default function TcgPage({ tcg }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const hub = getTcgHub(tcg)

  // Japanese subsection state — separate from `state.data` (which stays the
  // International list) so its lazy load never blocks or re-triggers the
  // primary page render. jaAvail is null while the live existence check is
  // still in flight (nothing renders until it resolves, so no section
  // flashes in/out).
  const [jaAvail, setJaAvail] = useState(null) // null=checking | true | false
  const [jaSets, setJaSets] = useState([])
  const [jaState, setJaState] = useState('idle') // idle | loading | done

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    setJaAvail(null); setJaSets([]); setJaState('idle')

    detectJapaneseSets(tcg).then(hasJa => {
      if (!alive) return
      setJaAvail(hasJa)

      if (hasJa) {
        // Real ja data exists for this tcg (pokemon/onepiece today) — use the
        // same lang-scoped computation as the Japanese section itself, just
        // with lang='en', instead of the generic (language-agnostic)
        // getTcgPageData/computeTcgSets path. Necessary, not additional: it
        // replaces the page's one required set-list query, it doesn't add to it.
        const h2 = getTcgHub(tcg)
        loadLangSets(tcg, 'en').then(({ sets, setCount }) => {
          if (!alive) return
          setState({ loading: false, data: { tcg, label: h2.label, description: h2.description, logo: h2.logo, setCount, sets }, error: null })
        }).catch(err => {
          if (!alive) return
          setState({ loading: false, data: null, error: err.message || 'error' })
        })
      } else {
        // No real ja data for this tcg — original path, unchanged, zero extra
        // queries beyond the one detectJapaneseSets() check above.
        getTcgPageData(tcg).then(data => {
          if (!alive) return
          if (!data) { setState({ loading: false, data: null, error: 'not_found' }); return }
          setState({ loading: false, data, error: null })
        }).catch(err => {
          if (!alive) return
          setState({ loading: false, data: null, error: err.message || 'error' })
        })
      }
    })

    return () => { alive = false }
  }, [tcg])

  const loadJapanese = () => {
    setJaState('loading')
    loadLangSets(tcg, 'ja').then(({ sets }) => {
      setJaSets(sets)
      setJaState('done')
    })
  }

  useEffect(() => {
    const d = state.data
    if (!d) return
    const hub = getTcgHub(d.tcg)
    const tcgLabel = hub?.label || d.tcg
    const setUrl = `https://dragold.org/${d.tcg}`
    // Conteggio/elenco reali: include i set Japanese solo una volta davvero
    // caricati (jaState==='done'), mai stimati o anticipati.
    const jaLoaded = jaState === 'done'
    const totalSetCount = d.setCount + (jaLoaded ? jaSets.length : 0)
    const allSetsForLd = jaLoaded ? [...d.sets, ...jaSets] : d.sets
    const firstLogo = allSetsForLd.find(s => s.logoUrl)?.logoUrl || d.logo || null
    setRobotsMeta(null)
    setSeoMeta({
      title: `${d.label} — Sets, Cards & Collector's Guide — DraGold`,
      description: `${d.description} ${totalSetCount} sets indexed.`,
      image: firstLogo,
      url: setUrl,
    })

    const graph = [{
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
        { '@type': 'ListItem', position: 2, name: d.label, item: setUrl },
      ],
    }]
    graph.push({
      '@type': 'CollectionPage',
      name: `${d.label} — DraGold`,
      description: d.description,
      url: setUrl,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: totalSetCount,
        itemListElement: allSetsForLd.slice(0, 100).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.setName,
          url: `https://dragold.org/set/${s.slug}`,
        })),
      },
    })
    setJsonLd({ '@context': 'https://schema.org', '@graph': graph })
  }, [state.data, jaState, jaSets])

  if (state.loading) {
    return h('div', { style: styles.page }, h('div', { style: styles.wrap },
      h('div', { className: 'skel-card', style: { display: 'flex', flexDirection: 'column', gap: 14, background: 'transparent', border: 'none', padding: 0 } },
        h('div', { className: 'skel-line', style: { height: 32, width: '50%' } }),
        h('div', { className: 'skel-line w40' }),
      )
    ))
  }

  if (state.error || !state.data) {
    // Stesso limite architetturale di CardPage.jsx/SetPage.jsx (nessuna vera
    // SSR lato client): noindex evita un "soft 404" indicizzabile. Il vero
    // HTTP 404 per i crawler resta gestito da middleware.js.
    setRobotsMeta('noindex')
    return h('div', { style: styles.page }, h('div', { style: styles.center },
      h('h1', { style: styles.h1 }, 'TCG not found'),
      h('p', { style: styles.muted }, 'This game is not yet available on DraGold.'),
      h('a', { href: '/', style: styles.link }, 'Back to home')
    ))
  }

  const d = state.data

  // Explorer/Set-Experience feature — group the already release_date-DESC
  // sorted list (lib/tcgSets.js) into year buckets so the year is visible
  // without opening a set. mtg/ygo have no release-date source in this DB
  // (verified — no invented dates), so their sets land in one "release date
  // unknown" bucket instead of fabricated year headers.
  function yearGroupsOf(sets) {
    const groups = []
    for (const set of sets) {
      const key = set.releaseYear != null ? String(set.releaseYear) : 'unknown'
      let g = groups[groups.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: set.releaseYear != null ? String(set.releaseYear) : 'Release date unknown', items: [] }
        groups.push(g)
      }
      g.items.push(set)
    }
    return groups
  }

  function renderSetTile(s) {
    const logo = s.logoUrl
      ? h('img', { src: s.logoUrl, alt: s.setName, style: styles.setLogo, loading: 'lazy', onError: e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling?.style && (e.currentTarget.nextSibling.style.display = 'flex') } })
      : null
    // Fallback when this TCG/set has no logo asset (mtg/ygo, Pokemon JP, or a
    // one-off missing row) — a labeled placeholder, never a blank tile and
    // never a generated/invented logo. Same fallback already used everywhere
    // else on this page (and in Explorer).
    const fallback = h('div', { style: { ...styles.setLogoFallback, display: s.logoUrl ? 'none' : 'flex', color: hub?.color || '#9aa0ff' } }, s.setId)
    const meta = h('div', { style: styles.muted },
      `${s.cardCount} card${s.cardCount === 1 ? '' : 's'}`,
      s.releaseDate ? ` · ${formatReleaseDate(s.releaseDate)}` : ''
    )
    // Japanese tiles carry ?lang=ja so Set Detail scopes to that edition
    // explicitly (see file-header comment) — International tiles keep the
    // bare slug, unchanged.
    const href = '/set/' + s.slug + (s.lang && s.lang !== 'en' ? `?lang=${encodeURIComponent(s.lang)}` : '')
    return h('a', { href, className: 'dg-tcg-tile', style: styles.setTile, key: href },
      logo, fallback, h('div', { style: styles.setName }, s.setName), meta)
  }

  function renderSetList(sets, { emptyLabel }) {
    if (!sets.length) return h('p', { style: styles.muted }, emptyLabel)
    const groups = yearGroupsOf(sets)
    const showYearHeaders = groups.length > 1 || (groups[0] && groups[0].key !== 'unknown')
    return groups.map(g => h('div', { key: g.key, style: { marginBottom: 28 } },
      showYearHeaders ? h('div', { style: styles.yearHead }, g.label) : null,
      h('div', { style: styles.grid }, g.items.map(renderSetTile))
    ))
  }

  const internationalSection = h('div', { style: { marginBottom: jaAvail ? 36 : 0 } },
    jaAvail ? h('h3', { style: styles.langHead }, 'International') : null,
    renderSetList(d.sets, { emptyLabel: 'No sets indexed yet.' })
  )

  const japaneseSection = jaAvail ? h('div', null,
    h('h3', { style: styles.langHead }, 'Japanese'),
    jaState === 'idle'
      ? h('button', { type: 'button', style: styles.btnGhost, onClick: loadJapanese }, 'Show Japanese sets')
      : jaState === 'loading'
        ? h('p', { style: styles.muted }, 'Loading Japanese sets…')
        : renderSetList(jaSets, { emptyLabel: 'No Japanese sets indexed yet.' })
  ) : null

  return h('div', { style: styles.page },
    h('style', null, TILE_CSS),
    h('div', { style: styles.wrap },
      h('a', { href: '/', style: styles.backLink }, '← DraGold'),
      h('nav', { style: styles.breadcrumb, 'aria-label': 'breadcrumb' },
        h('a', { href: '/', style: styles.breadcrumbLink }, 'DraGold'),
        h('span', null, ' / '),
        h('span', { style: styles.breadcrumbCurrent }, d.label)
      ),
      h('div', { style: styles.head },
        // TCG logo — real asset already in the project (public/logos/*.png),
        // shown at header size (not a small icon) since this is the primary
        // identity of the page, not decoration.
        d.logo ? h('img', { src: d.logo, alt: `${d.label} logo`, style: styles.hubLogo }) : null,
        h('div', null,
          h('h1', { style: styles.h1 }, d.label),
          h('p', { style: styles.subtitle }, 'Explore sets and cards'),
          h('p', { style: styles.muted }, `${d.setCount}${jaAvail && jaState === 'done' ? ` + ${jaSets.length} Japanese` : ''} set${d.setCount === 1 ? '' : 's'} indexed`),
          h('p', { style: styles.muted },
            h('a', { href: '/', style: styles.link }, 'Explore in DraGold'),
            ' · ',
            h('a', { href: '/academy', style: styles.link }, 'New to TCGs? Visit the Academy')
          )
        )
      ),
      h('section', { style: styles.section },
        h('h2', { style: styles.h2 }, 'Sets'),
        internationalSection,
        japaneseSection
      )
    )
  )
}

function formatReleaseDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso }
}

// Inline-style pages (this file, SetPage.jsx, CardPage.jsx) can't express
// :hover/:focus-visible via style objects — one small scoped <style> tag
// instead of switching the whole page to a stylesheet, same gold-outline
// focus convention already used across styles.css.
const TILE_CSS = `
.dg-tcg-tile{transition:transform .15s ease,border-color .15s ease;}
.dg-tcg-tile:hover{transform:translateY(-2px);border-color:#3a3a55;}
.dg-tcg-tile:focus-visible{outline:2px solid #fbbf24;outline-offset:2px;border-color:#3a3a55;}
`

const styles = {
  page: { minHeight: '100vh', background: '#020208', color: '#f4f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 1100, margin: '0 auto' },
  center: { textAlign: 'center', padding: '80px 16px' },
  backLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 16 },
  breadcrumb: { fontSize: 13, color: '#888', marginBottom: 24 },
  breadcrumbLink: { color: '#9aa0ff', textDecoration: 'none' },
  breadcrumbCurrent: { color: '#c0c0d0' },
  head: { marginBottom: 32, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' },
  h1: { fontSize: 30, margin: '0 0 8px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 16px', fontWeight: 600 },
  langHead: { fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8a8aa0', margin: '0 0 14px' },
  subtitle: { color: '#a0a0b0', margin: '0 0 8px', fontSize: 15, maxWidth: 640 },
  section: { marginTop: 20, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  setTile: { textDecoration: 'none', color: 'inherit', display: 'block', background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: 14, outline: 'none' },
  setLogo: { maxHeight: 40, maxWidth: '100%', objectFit: 'contain', marginBottom: 10, display: 'block' },
  setLogoFallback: { alignItems: 'center', justifyContent: 'center', height: 40, marginBottom: 10, border: '1px dashed currentColor', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', opacity: .85 },
  setName: { fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 },
  muted: { color: '#777', fontSize: 13 },
  link: { color: '#9aa0ff' },
  hubLogo: { height: 64, maxWidth: 200, objectFit: 'contain', flexShrink: 0 },
  yearHead: { fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8a8aa0', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1e1e2e' },
  btnGhost: { background: 'transparent', color: '#c0c0d0', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
}
