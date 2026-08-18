// DraGold - Public TCG Hub Page (Block 6, TCG Hub SEO Foundation)
// Componente isolato, stesso pattern di CardPage.jsx/SetPage.jsx: main.jsx fa
// solo routing verso questa pagina. /{tcg} e' la URL SEO pubblica del TCG,
// livello piu' alto del Knowledge Graph TCG -> Set -> Canonical Card -> Print/lang.
// Discovery + SEO + navigazione: NIENTE market dashboard, prezzi aggregati,
// grafici, portfolio.
import { getTcgPageData } from './tcgPageData.js'
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

  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    getTcgPageData(tcg).then(data => {
      if (!alive) return
      if (!data) { setState({ loading: false, data: null, error: 'not_found' }); return }
      setState({ loading: false, data, error: null })
    }).catch(err => {
      if (!alive) return
      setState({ loading: false, data: null, error: err.message || 'error' })
    })
    return () => { alive = false }
  }, [tcg])

  useEffect(() => {
    const d = state.data
    if (!d) return
    const hubUrl = `https://dragold.org/${d.tcg}`
    const firstLogo = d.sets.find(s => s.logoUrl)?.logoUrl || null
    setRobotsMeta(null)
    setSeoMeta({
      title: `${d.label} — Sets, Cards & Market Prices — DraGold`,
      description: `${d.description} ${d.setCount} sets indexed.`,
      image: firstLogo,
      url: hubUrl,
    })

    const graph = [{
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
        { '@type': 'ListItem', position: 2, name: d.label, item: hubUrl },
      ],
    }]
    graph.push({
      '@type': 'CollectionPage',
      name: `${d.label} — DraGold`,
      description: d.description,
      url: hubUrl,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: d.setCount,
        itemListElement: d.sets.slice(0, 100).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.setName,
          url: `https://dragold.org/set/${s.slug}`,
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

  const setList = d.sets.length
    ? h('div', { style: styles.grid }, d.sets.map(s => h('a', { href: '/set/' + s.slug, style: styles.setTile, key: s.slug },
        s.logoUrl ? h('img', { src: s.logoUrl, alt: s.setName, style: styles.setLogo, loading: 'lazy', onError: e => { e.currentTarget.style.display = 'none' } }) : null,
        h('div', { style: styles.setName }, s.setName),
        h('div', { style: styles.muted }, `${s.cardCount} card${s.cardCount === 1 ? '' : 's'}`)
      )))
    : h('p', { style: styles.muted }, 'No sets indexed yet.')

  return h('div', { style: styles.page },
    h('div', { style: styles.wrap },
      h('a', { href: '/', style: styles.backLink }, '← DraGold'),
      h('nav', { style: styles.breadcrumb, 'aria-label': 'breadcrumb' },
        h('a', { href: '/', style: styles.breadcrumbLink }, 'DraGold'),
        h('span', null, ' / '),
        h('span', { style: styles.breadcrumbCurrent }, d.label)
      ),
      h('div', { style: styles.head },
        h('h1', { style: styles.h1 }, d.label),
        h('p', { style: styles.subtitle }, d.description),
        h('p', { style: styles.muted }, `${d.setCount} set${d.setCount === 1 ? '' : 's'} indexed`)
      ),
      h('section', { style: styles.section },
        h('h2', { style: styles.h2 }, 'Sets'),
        setList
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
  head: { marginBottom: 32 },
  h1: { fontSize: 30, margin: '0 0 8px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 16px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: '0 0 8px', fontSize: 15, maxWidth: 640 },
  section: { marginTop: 20, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 },
  setTile: { textDecoration: 'none', color: 'inherit', display: 'block', background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: 14 },
  setLogo: { maxHeight: 40, maxWidth: '100%', objectFit: 'contain', marginBottom: 10, display: 'block' },
  setName: { fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 },
  muted: { color: '#777', fontSize: 13 },
  link: { color: '#9aa0ff' },
}
