// DraGold - Public Illustrator Page (blocco "Illustrator Pages")
// Componente isolato, stesso pattern di CardPage.jsx/SetPage.jsx: DraGold.jsx/main.jsx
// fa solo routing verso questa pagina. /illustrator/{slug} e' l'entita' Illustrator
// del Knowledge Graph (TCG -> Set -> Canonical Card -> Print/lang, + Illustrator come
// nodo trasversale collegato alla carta).
import { getIllustratorPageData } from './illustratorPageData.js'
import { useEffect, useState, createElement as h } from 'react'

const TCG_LABELS = { pokemon: 'Pokémon', mtg: 'Magic: The Gathering', ygo: 'Yu-Gi-Oh!', onepiece: 'One Piece' }

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
  let el = document.getElementById('ld-illustrator')
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = 'ld-illustrator'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

export default function IllustratorPage({ slug }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    getIllustratorPageData(slug).then(data => {
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
    const illustratorUrl = `https://dragold.org/illustrator/${d.slug}`
    const tcgLabels = d.tcgs.map(t => TCG_LABELS[t] || t).join(', ')
    const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`
    setRobotsMeta(null)
    setSeoMeta({
      title: `${d.name} — Illustrator, Cards & Artwork — DraGold`,
      description: `${d.name} has illustrated ${countTxt} on DraGold${tcgLabels ? ` (${tcgLabels})` : ''}. Browse the full gallery with prices and rarities.`,
      image: null, // nessuna foto/illustrazione dell'artista verificata: non si inventa
      url: illustratorUrl,
    })

    // BreadcrumbList: DraGold -> Illustrator (2 livelli). L'Illustrator e' un'entita'
    // trasversale ai TCG (non scoped a un solo tcg, vedi src/lib/illustratorSlug.js),
    // quindi non si inserisce un nodo TCG intermedio fittizio nel breadcrumb.
    const graph = [{
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
        { '@type': 'ListItem', position: 2, name: d.name, item: illustratorUrl },
      ],
    }, {
      '@type': 'CollectionPage',
      name: `${d.name} — Illustrator — DraGold`,
      description: `Cards illustrated by ${d.name}${tcgLabels ? ` (${tcgLabels})` : ''}.`,
      url: illustratorUrl,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: d.cardCount,
        itemListElement: d.cards.slice(0, 60).map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          url: `https://dragold.org/carta/${c.cardSlug}`,
        })),
      },
    }]
    setJsonLd({ '@context': 'https://schema.org', '@graph': graph })
  }, [state.data])

  if (state.loading) {
    return h('div', { style: styles.page }, h('div', { style: styles.wrap },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'skel-line', style: { height: 32, width: '50%' } }),
        h('div', { className: 'skel-line w40' }),
      )
    ))
  }

  if (state.error || !state.data) {
    // Nessuna vera SSR/status code lato client (stesso limite architetturale gia'
    // documentato per CardPage.jsx/SetPage.jsx): noindex e' il minimo compatibile per
    // evitare un "soft 404" indicizzabile. Il vero HTTP 404 per i crawler e' gestito
    // da middleware.js (handleIllustratorBot).
    setRobotsMeta('noindex')
    return h('div', { style: styles.page }, h('div', { style: styles.center },
      h('h1', { style: styles.h1 }, 'Illustrator not found'),
      h('p', { style: styles.muted }, 'This illustrator is not yet available on DraGold.'),
      h('a', { href: '/', style: styles.link }, 'Back to home')
    ))
  }

  const d = state.data
  const tcgLabels = d.tcgs.map(t => TCG_LABELS[t] || t).join(', ')
  const countTxt = d.hasMore ? `${d.cardCount}+ cards` : `${d.cardCount} card${d.cardCount === 1 ? '' : 's'}`

  const cardGrid = h('div', { style: styles.grid }, d.cards.map(c => {
    const img = c.image_url_hi || c.image_url
    return h('a', { style: styles.cardTile, key: c.id, href: '/carta/' + c.cardSlug },
      img ? h('img', { src: img, alt: c.name, style: styles.cardImg, loading: 'lazy' }) : h('div', { style: styles.cardImgPh }),
      h('div', { style: styles.cardName }, c.name),
      h('div', { style: styles.muted }, '#' + c.card_number)
    )
  }))

  return h('div', { style: styles.page },
    h('div', { style: styles.wrap },
      h('a', { href: '/', style: styles.backLink }, '← DraGold'),
      h('nav', { style: styles.breadcrumb, 'aria-label': 'breadcrumb' },
        h('a', { href: '/', style: styles.breadcrumbLink }, 'DraGold'),
        h('span', null, ' / '),
        h('span', { style: styles.breadcrumbCurrent }, d.name)
      ),
      h('div', { style: styles.head },
        h('div', null,
          h('h1', { style: styles.h1 }, d.name),
          h('p', { style: styles.subtitle }, `Illustrator${tcgLabels ? ` · ${tcgLabels}` : ''} · ${countTxt}`)
        )
      ),
      h('section', { style: styles.section },
        h('h2', { style: styles.h2 }, `Cards illustrated by ${d.name}`),
        cardGrid
      )
    )
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#020208', color: '#f4f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 1100, margin: '0 auto' },
  center: { textAlign: 'center', padding: '80px 16px' },
  backLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 16 },
  breadcrumb: { fontSize: 13, color: '#888', marginBottom: 24 },
  breadcrumbLink: { color: '#9aa0ff', textDecoration: 'none' },
  breadcrumbCurrent: { color: '#c0c0d0' },
  head: { display: 'flex', gap: 20, alignItems: 'center', marginBottom: 32, flexWrap: 'wrap' },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 16px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: 0, fontSize: 14 },
  section: { marginTop: 20, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 },
  cardTile: { textDecoration: 'none', color: 'inherit', display: 'block' },
  cardImg: { width: '100%', borderRadius: 8, marginBottom: 6, aspectRatio: '3/4', objectFit: 'cover' },
  cardImgPh: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 8, marginBottom: 6 },
  cardName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  muted: { color: '#777', fontSize: 13 },
  link: { color: '#9aa0ff' },
}
