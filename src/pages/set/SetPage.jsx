// DraGold - Public Set Page (Block 5, SEO Foundation for Sets)
// Componente isolato, stesso pattern di CardPage.jsx: DraGold.jsx/main.jsx fa
// solo routing verso questa pagina. /set/{slug} e' la URL SEO pubblica del Set,
// entita' intermedia del Knowledge Graph TCG -> Set -> Canonical Card -> Print/lang.
import { getSetPageData } from './setPageData.js'
import { getTcgHub } from '../../lib/tcgConfig.js'
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

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    getSetPageData(slug).then(data => {
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
    const hub = getTcgHub(d.tcg)
    const tcgLabel = hub?.label || d.tcg
    const setUrl = `https://dragold.org/set/${d.slug}`
    const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`
    setRobotsMeta(null)
    setSeoMeta({
      title: `${d.setName} (${tcgLabel}) — Set Guide & Card List — DraGold`,
      description: `${d.setName} is a ${tcgLabel} set${d.releaseDate ? ` released ${d.releaseDate}` : ''} with ${countTxt}. Browse every card, rarity and variant, and track this set in your collection on DraGold.`,
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

  const d = state.data
  const hub = getTcgHub(d.tcg)
  const tcgLabel = hub?.label || d.tcg
  const releaseYear = d.releaseDate ? new Date(d.releaseDate).getFullYear() : null
  const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`

  const cardGrid = d.cards.length
    ? h('div', { style: styles.grid }, d.cards.map(c => {
        const tag = c.cardSlug ? 'a' : 'div'
        const props = { style: styles.cardTile, key: c.id, className: c.cardSlug ? 'dg-card-tile' : undefined }
        if (c.cardSlug) props.href = '/carta/' + c.cardSlug
        const img = c.image_url_hi || c.image_url
        return h(tag, props,
          img ? h('img', { src: img, alt: c.name, style: styles.cardImg, loading: 'lazy' }) : h('div', { style: styles.cardImgPh }),
          h('div', { style: styles.cardName }, c.name),
          h('div', { style: styles.muted }, '#' + c.card_number)
        )
      }))
    : h('p', { style: styles.muted }, 'No cards indexed for this set yet.')

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
        h('span', { style: styles.breadcrumbCurrent }, d.setName)
      ),
      h('div', { style: styles.head },
        d.logoUrl ? h('img', { src: d.logoUrl, alt: d.setName, style: styles.logo, onError: e => { e.currentTarget.style.display = 'none' } }) : null,
        h('div', null,
          hub?.logo ? h('img', { src: hub.logo, alt: '', style: styles.hubBadge }) : null,
          h('h1', { style: styles.h1 }, d.setName),
          h('p', { style: styles.subtitle },
            tcgLabel,
            ' · ', d.setId,
            d.releaseDate ? ` · Released ${formatDate(d.releaseDate)}` : '',
            releaseYear ? ` (${releaseYear})` : '',
            ` · ${countTxt}`,
            d.seriesName ? ` · ${d.seriesName} series` : ''
          ),
          h('p', { style: { ...styles.muted, marginTop: 8 } },
            h('a', { href: '/', style: styles.link, className: 'dg-set-link' }, 'Track this set in your Collection'),
            ' · ',
            h('a', { href: '/academy/tcg-basics', style: styles.link, className: 'dg-set-link' }, 'Learn: Card, Set, Release & Variant')
          )
        )
      ),
      h('section', { style: styles.section },
        h('h2', { style: styles.h2 }, 'Cards in this set'),
        cardGrid
      )
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
  head: { display: 'flex', gap: 20, alignItems: 'center', marginBottom: 32, flexWrap: 'wrap' },
  logo: { maxHeight: 64, maxWidth: 220, objectFit: 'contain' },
  hubBadge: { height: 16, marginBottom: 6, opacity: .8, display: 'block' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 16px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: 0, fontSize: 14 },
  section: { marginTop: 20, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 },
  cardTile: { textDecoration: 'none', color: 'inherit', display: 'block', borderRadius: 8 },
  cardImg: { width: '100%', borderRadius: 8, marginBottom: 6, aspectRatio: '3/4', objectFit: 'cover' },
  cardImgPh: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 8, marginBottom: 6 },
  cardName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  muted: { color: '#777', fontSize: 13 },
  link: { color: '#9aa0ff' },
}
