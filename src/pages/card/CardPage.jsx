// DraGold - Public Card Page (Fase 2, V1)
// Componente isolato: DraGold.jsx fa solo routing verso questa pagina.
import { getCardPageData } from './cardPageData.js'
import { addToCollection, addToWatchlist } from '../../supabase.js'
import { useEffect, useState, createElement as h, Fragment } from 'react'
function formatPrice(value, currency) {
  if (value == null) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
  } catch {
    return `${value} ${currency || ''}`
  }
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

useEffect(() => {
  let alive = true
  setState({ loading: true, data: null, error: null })
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
  const { primary, currentPrice, displayName, displaySetName } = d
  const priceTxt = currentPrice?.price_market ? ` — ${formatPrice(currentPrice.price_market, currentPrice.currency)}` : ''
  setSeoMeta({
    title: `${displayName} (${displaySetName} #${primary.card_number}) — DraGold${priceTxt}`,
    description: `${displayName} — ${displaySetName} #${primary.card_number}, rarity: ${primary.rarity || 'N/A'}. Market price, price history and best offers on DraGold.`,
    image: primary.image_url_hi || primary.image_url,
    url: `https://dragold.org/carta/${slug}`,
  })

      const cardUrl = `https://dragold.org/carta/${slug}`
      const imageUrl = primary.image_url_hi || primary.image_url
      const graph = []
      graph.push({
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'DraGold', item: 'https://dragold.org/' },
                { '@type': 'ListItem', position: 2, name: displaySetName, item: cardUrl },
                { '@type': 'ListItem', position: 3, name: displayName, item: cardUrl },
                      ]
      })
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
                        availability: 'https://schema.org/InStock',
                        url: cardUrl,
              }
      }
      graph.push(productNode)
      setJsonLd({ '@context': 'https://schema.org', '@graph': graph })
}, [state.data])

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
  const sameSetCards = state.data.sameSetCards

async function handleAddCollection() {
  setCtaMsg('Adding...')
  const res = await addToCollection({ card_api_id: primary.id, tcg: primary.tcg, card_name: primary.name, set_name: primary.set_name, image_url: primary.image_url })
  setCtaMsg(res && res.error ? ('Error: ' + (res.error.message || res.error)) : 'Added to collection!')
}

async function handleAddWatchlist() {
  setCtaMsg('Adding...')
  const res = await addToWatchlist({ tcg: primary.tcg, cardApiId: primary.id, cardName: primary.name, setName: primary.set_name, imageUrl: primary.image_url })
  setCtaMsg(res && res.error ? ('Error: ' + (res.error.message || res.error)) : 'Added to watchlist!')
}

const heroImage = primary.image_url_hi || primary.image_url
  const badgeEls = [
    (rarity && rarity.label_en) ? h('span', { style: styles.badge, key: 'rarity' }, rarity.label_en) : (primary.rarity ? h('span', { style: styles.badge, key: 'rarity' }, primary.rarity) : null),
    h('span', { style: styles.badge, key: 'tcg' }, (primary.tcg || '').toUpperCase())
    ]

const priceBlock = (currentPrice && currentPrice.price_market != null)
  ? h(Fragment, null,
      h('div', { style: styles.priceLabel }, 'Market price'),
      h('div', { style: styles.priceValue }, formatPrice(currentPrice.price_market, currentPrice.currency)),
      currentPrice.captured_at ? h('div', { style: styles.muted }, 'Updated on ' + new Date(currentPrice.captured_at).toLocaleDateString('en-US')) : null
      )
  : h('div', { style: styles.muted }, 'Price not yet available for this card.')

const metaEls = []
  if (primary.illustrator) metaEls.push(h('p', { style: styles.meta, key: 'ill' }, 'Illustrator: ', h('strong', null, primary.illustrator)))
  if (primary.evolves_from) metaEls.push(h('p', { style: styles.meta, key: 'evo' }, 'Evolves from: ', h('strong', null, primary.evolves_from)))
  if (primary.series_name) metaEls.push(h('p', { style: styles.meta, key: 'series' }, 'Series: ', h('strong', null, primary.series_name)))

const historySection = (priceHistory && priceHistory.length > 1) ? h('section', { style: styles.section },
                                                                     h('h2', { style: styles.h2 }, 'Price history'),
                                                                     h('div', { style: styles.historyList }, priceHistory.slice(0, 10).map((p, i) => h('div', { style: styles.historyRow, key: i },
                                                                                                                                                       h('span', null, p.captured_at ? new Date(p.captured_at).toLocaleDateString('en-US') : '—'),
                                                                                                                                                       h('span', null, formatPrice(p.price_market, p.currency) || '—')
                                                                                                                                                       )))
                                                                     ) : null

const langSection = (languages && languages.length > 1) ? h('section', { style: styles.section },
                                                            h('h2', { style: styles.h2 }, 'Available languages'),
                                                            h('div', { style: styles.badges }, languages.map(l => h('span', { style: l === primary.lang ? styles.badgeActive : styles.badge, key: l }, l.toUpperCase())))
                                                            ) : null

const variantSection = (variants && variants.length > 1) ? h('section', { style: styles.section },
                                                             h('h2', { style: styles.h2 }, 'Variants'),
                                                             h('div', { style: styles.variantGrid }, variants.map(v => h('div', { style: styles.variantCard, key: v.id },
                                                                                                                         v.image_url ? h('img', { src: v.image_url, alt: v.name, style: styles.variantImg }) : null,
                                                                                                                         h('div', { style: styles.muted }, (v.print_variant || 'Standard') + ' · ' + (v.lang || '').toUpperCase())
                                                                                                                         )))
                                                             ) : null

const relatedGrid = (sameSetCards && sameSetCards.length > 0)
  ? h('div', { style: styles.relatedGrid }, sameSetCards.map(c => {
    const slug2 = c.slug
    const tag = slug2 ? 'a' : 'div'
    const props = { style: styles.relatedCard, key: c.id }
    if (slug2) props.href = '/carta/' + slug2
    return h(tag, props,
             c.image_url ? h('img', { src: c.image_url, alt: c.name, style: styles.relatedImg }) : h('div', { style: styles.imgPlaceholderSmall }),
             h('div', { style: styles.relatedName }, c.name),
             h('div', { style: styles.muted }, '#' + c.card_number)
             )
  }))
  : h('p', { style: styles.muted }, 'No other cards from this set indexed yet.')

return h('div', { style: styles.page },
         h('div', { style: styles.wrap },
           h('a', { href: '/', style: styles.backLink }, '← DraGold'),
           h('div', { style: styles.hero },
             h('div', { style: styles.imgWrap },
               heroImage ? h('img', { src: heroImage, alt: primary.name, style: styles.img }) : h('div', { style: styles.imgPlaceholder }, 'Image not available')
               ),
             h('div', { style: styles.info },
               h('h1', { style: styles.h1 }, displayName),
               h('p', { style: styles.subtitle }, displaySetName + ' · #' + primary.card_number + ' · ' + (primary.lang || '').toUpperCase()),
               h('div', { style: styles.badges }, badgeEls),
               h('div', { style: styles.priceBox }, priceBlock),
               metaEls,
               h('div', { style: styles.ctaRow },
                 h('button', { style: styles.btnPrimary, onClick: handleAddCollection }, '+ Add to Collection'),
                 h('button', { style: styles.btnSecondary, onClick: handleAddWatchlist }, '+ Add to Watchlist')
                 ),
               ctaMsg ? h('p', { style: styles.muted }, ctaMsg) : null
               )
             ),
           historySection,
           langSection,
           variantSection,
           h('section', { style: styles.section },
             h('h2', { style: styles.h2 }, 'Set: ' + displaySetName),
             relatedGrid
             )
           )
         )
}


const styles = {
  page: { minHeight: '100vh', background: '#020208', color: '#f4f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 960, margin: '0 auto' },
  center: { textAlign: 'center', padding: '80px 16px' },
  backLink: { color: '#9aa0ff', textDecoration: 'none', fontSize: 14, display: 'inline-block', marginBottom: 24 },
  hero: { display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 40 },
  imgWrap: { flex: '0 0 280px', maxWidth: 280 },
  img: { width: '100%', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  imgPlaceholder: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13, textAlign: 'center', padding: 16 },
  imgPlaceholderSmall: { width: '100%', aspectRatio: '3/4', background: '#14141f', borderRadius: 8 },
  info: { flex: '1 1 320px', minWidth: 280 },
  h1: { fontSize: 28, margin: '0 0 6px', fontWeight: 700 },
  h2: { fontSize: 18, margin: '0 0 12px', fontWeight: 600 },
  subtitle: { color: '#a0a0b0', margin: '0 0 16px', fontSize: 15 },
  badges: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  badge: { background: '#1a1a28', border: '1px solid #2a2a3a', borderRadius: 20, padding: '4px 12px', fontSize: 12 },
  badgeActive: { background: '#4b3cff', border: '1px solid #4b3cff', borderRadius: 20, padding: '4px 12px', fontSize: 12 },
  priceBox: { background: '#0f0f18', border: '1px solid #23233a', borderRadius: 12, padding: 16, marginBottom: 16 },
  priceLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  priceValue: { fontSize: 28, fontWeight: 700 },
  meta: { fontSize: 14, color: '#c0c0d0', margin: '4px 0' },
  muted: { color: '#777', fontSize: 13 },
  ctaRow: { display: 'flex', gap: 10, marginTop: 16 },
  btnPrimary: { background: '#4b3cff', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { background: 'transparent', color: '#f4f4f8', border: '1px solid #3a3a4a', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' },
  section: { marginBottom: 36, borderTop: '1px solid #1a1a28', paddingTop: 24 },
  historyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  historyRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #14141f', fontSize: 14 },
  variantGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 },
  variantCard: { textAlign: 'center' },
  variantImg: { width: '100%', borderRadius: 8, marginBottom: 6 },
  relatedGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 14 },
  relatedCard: { textDecoration: 'none', color: 'inherit', display: 'block' },
  relatedImg: { width: '100%', borderRadius: 8, marginBottom: 6 },
  relatedName: { fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  link: { color: '#9aa0ff' },
}
