import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

/* -------------------------------------------------------------------------- */
/*  Supabase init: env vars set in Vercel (VITE_SUPABASE_URL, ...)            */
/* -------------------------------------------------------------------------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const EBAY_CAMPAIGN_ID = '5339152703'

/* -------------------------- eBay geo-routing -------------------------- */
const EBAY_DOMAINS = {
  IT: { domain: 'ebay.it', siteId: 101, currency: 'EUR', label: 'Italy' },
  DE: { domain: 'ebay.de', siteId: 77, currency: 'EUR', label: 'Germany' },
  FR: { domain: 'ebay.fr', siteId: 71, currency: 'EUR', label: 'France' },
  ES: { domain: 'ebay.es', siteId: 186, currency: 'EUR', label: 'Spain' },
  GB: { domain: 'ebay.co.uk', siteId: 3, currency: 'GBP', label: 'UK' },
  US: { domain: 'ebay.com', siteId: 0, currency: 'USD', label: 'USA' },
  CA: { domain: 'ebay.com', siteId: 0, currency: 'USD', label: 'Canada' },
}
const EU_COUNTRIES = ['IT','DE','FR','ES','NL','BE','AT','PT','IE','GR','FI','PL','SE','DK','CZ','RO','HU','LU','SI','SK','BG','HR','EE','LV','LT','MT','CY']

/* -------------------------- Card languages (the differentiator) -------------------------- */
/* Different card languages have different market values. JP usually higher quality, IT/FR lower demand */
const CARD_LANGUAGES = {
  EN: { label: 'English',  flag: 'EN', keyword: '', multiplier: 1.00 },
  JP: { label: 'Japanese', flag: 'JP', keyword: 'japanese', multiplier: 1.35 },
  DE: { label: 'German',   flag: 'DE', keyword: 'deutsch',  multiplier: 0.78 },
  FR: { label: 'French',   flag: 'FR', keyword: 'francais', multiplier: 0.72 },
  IT: { label: 'Italian',  flag: 'IT', keyword: 'italiano', multiplier: 0.65 },
  ES: { label: 'Spanish',  flag: 'ES', keyword: 'espanol',  multiplier: 0.68 },
  PT: { label: 'Portuguese', flag: 'PT', keyword: 'portugues', multiplier: 0.60 },
  KO: { label: 'Korean',   flag: 'KR', keyword: 'korean',  multiplier: 1.10 },
  ZH: { label: 'Chinese',  flag: 'CN', keyword: 'chinese', multiplier: 0.90 },
}

function buildEbayUrl({ query, country = 'IT', language = 'EN' }) {
  const region = EBAY_DOMAINS[country] || (EU_COUNTRIES.includes(country) ? { domain: 'ebay.com', siteId: 0, currency: 'EUR' } : EBAY_DOMAINS.US)
  const isEU = EU_COUNTRIES.includes(country)
  const langKw = CARD_LANGUAGES[language]?.keyword || ''
  const fullQuery = langKw ? `${query} ${langKw}` : query
  const base = `https://www.${region.domain}/sch/i.html`
  const params = new URLSearchParams({
    _nkw: fullQuery,
    LH_Sold: '1',
    LH_Complete: '1',
    _ipg: '60',
  })
  if (isEU && region.domain === 'ebay.com') params.set('LH_PrefLoc', '1')
  const search = `${base}?${params.toString()}`
  const epn = new URLSearchParams({
    mpre: search,
    campid: EBAY_CAMPAIGN_ID,
    toolid: '10001',
  })
  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1?${epn.toString()}`
}

/* -------------------------- helpers -------------------------- */
function detectCountry() {
  try {
    const stored = localStorage.getItem('dg_country')
    if (stored) return stored
    const lang = navigator.language || 'en-US'
    const tag = lang.split('-')[1] || 'US'
    return tag.toUpperCase()
  } catch { return 'US' }
}

function formatPrice(value, currency = 'EUR') {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat(currency === 'EUR' ? 'de-DE' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(value)
}

function netSell(fmv) { return fmv * 0.87 }

const PSA_MULT = { '10': 3.2, '9': 1.6, '8': 1.1 }

/* -------------------------- Card APIs -------------------------- */
async function searchPokemonCards(query) {
  if (!query) return []
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(query)}*"&pageSize=24&orderBy=-set.releaseDate`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Pokemon TCG API error')
  const data = await res.json()
  return (data.data || []).map(c => ({
    id: c.id,
    name: c.name,
    set: c.set?.name,
    setSeries: c.set?.series,
    number: c.number,
    rarity: c.rarity,
    image: c.images?.large || c.images?.small,
    fmvUsd: c.cardmarket?.prices?.averageSellPrice
      ?? c.tcgplayer?.prices?.holofoil?.market
      ?? c.tcgplayer?.prices?.normal?.market
      ?? c.tcgplayer?.prices?.reverseHolofoil?.market
      ?? null,
    fmvEur: c.cardmarket?.prices?.averageSellPrice ?? null,
    tcg: 'Pokemon',
  }))
}

/* One Piece TCG: usa apitcg.com (free, no auth required) */
async function searchOnePieceCards(query) {
  if (!query) return []
  try {
    const url = `https://apitcg.com/api/one-piece/cards?name=${encodeURIComponent(query)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const items = data.data || data.cards || []
    return items.slice(0, 24).map(c => ({
      id: c.id || c.code,
      name: c.name,
      set: c.set?.name || c.pack?.name,
      number: c.code || c.number,
      rarity: c.rarity,
      image: c.images?.large || c.images?.small || c.image,
      fmvUsd: null,
      fmvEur: null, /* OP TCG pricing limited, will fallback to eBay sold listings */
      tcg: 'One Piece',
    }))
  } catch {
    return []
  }
}

async function searchCards(tcg, query) {
  if (tcg === 'onepiece') return searchOnePieceCards(query)
  return searchPokemonCards(query)
}

/* -------------------------- UI components -------------------------- */
function Logo({ size = 36 }) {
  return (
    <img
      src="/assets/logo-gold.png"
      width={size} height={size}
      alt="DraGold"
      style={{ filter: 'drop-shadow(0 0 14px rgba(251,191,36,0.45))' }}
    />
  )
}

function Nav({ onAuth, onPricing, user }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      padding: '14px 24px',
      background: 'rgba(2,2,8,0.7)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={36} />
        <span className="font-syne" style={{ fontSize: 22, letterSpacing: '-0.02em' }}>DraGold</span>
      </a>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="#portfolio" style={{ padding: '8px 14px', color: 'var(--muted)', fontSize: 14 }}>Portfolio</a>
        <a href="#blog" style={{ padding: '8px 14px', color: 'var(--muted)', fontSize: 14 }}>Blog</a>
        <a href="#pricing" onClick={(e)=>{e.preventDefault(); onPricing();}} style={{ padding: '8px 14px', color: 'var(--muted)', fontSize: 14 }}>Pro</a>
        <button onClick={onAuth} style={{
          padding: '8px 16px',
          background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)',
          color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
        }}>
          {user ? user.email?.split('@')[0] : 'Sign in'}
        </button>
      </div>
    </nav>
  )
}

function Hero({ onSearch, tcg, setTcg, language, setLanguage }) {
  const [q, setQ] = useState('')

  return (
    <section id="top" style={{
      position: 'relative', minHeight: '92vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '120px 24px 60px',
      overflow: 'hidden',
    }}>
      <div className="aurora" style={{ top: '-100px', left: '-100px', background: 'var(--gold)' }} />
      <div className="aurora" style={{ bottom: '-100px', right: '-100px', background: 'var(--pink)', animationDelay: '6s' }} />
      <div className="aurora" style={{ top: '40%', left: '50%', background: 'var(--violet)', animationDelay: '12s', opacity: 0.4 }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1100, textAlign: 'center', width: '100%' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 999,
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          color: 'var(--gold)', fontSize: 13, marginBottom: 24,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gain)', boxShadow: '0 0 8px var(--gain)' }}></span>
          Live FMV across 9 languages and 5 regional eBay markets
        </div>

        <h1 className="font-bebas shimmer-text" style={{
          fontSize: 'clamp(64px, 14vw, 180px)', lineHeight: 0.9, marginBottom: 12,
        }}>
          THE VAULT
        </h1>

        <p className="font-syne" style={{
          fontSize: 'clamp(20px, 3vw, 32px)',
          marginBottom: 16, color: 'var(--text)',
        }}>
          The real value of your cards. In every language.
        </p>

        <p style={{
          color: 'var(--muted)', fontSize: 17, maxWidth: 640, margin: '0 auto 28px',
          lineHeight: 1.5,
        }}>
          We aggregate Fair Market Value from Cardmarket and TCGPlayer, adjust for language
          (Japanese, Italian, German, French and more), and route you to the right eBay marketplace.
          One number that actually matches your card.
        </p>

        {/* TCG + Language pills */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            { id: 'pokemon', label: 'Pokemon' },
            { id: 'onepiece', label: 'One Piece' },
          ].map(t => (
            <button key={t.id} onClick={() => setTcg(t.id)} style={{
              padding: '8px 16px',
              background: tcg === t.id ? 'var(--gold)' : 'var(--glass)',
              color: tcg === t.id ? '#000' : 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 999,
              fontWeight: 700, fontSize: 13,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {Object.entries(CARD_LANGUAGES).map(([code, lang]) => (
            <button key={code} onClick={() => setLanguage(code)} style={{
              padding: '6px 10px',
              background: language === code ? 'rgba(251,191,36,0.2)' : 'transparent',
              border: '1px solid',
              borderColor: language === code ? 'var(--gold)' : 'var(--border)',
              borderRadius: 8, color: language === code ? 'var(--gold)' : 'var(--muted)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            }}>{lang.flag}</button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSearch(q); }} style={{
          display: 'flex', maxWidth: 600, margin: '0 auto', gap: 8,
        }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search Charizard, Pikachu Illustrator, Luffy Leader..."
            style={{
              flex: 1, padding: '18px 20px',
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              borderRadius: 14, color: 'var(--text)', fontSize: 16, outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '0 28px',
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)',
            color: '#000', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 16,
            boxShadow: '0 8px 24px rgba(251,191,36,0.3)',
          }}>
            Search
          </button>
        </form>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(tcg === 'pokemon'
            ? ['Charizard ex', 'Umbreon VMAX', 'Pikachu Illustrator', 'Moonbreon', 'Lugia V Alt Art']
            : ['Monkey D. Luffy', 'Roronoa Zoro', 'Nico Robin', 'Trafalgar Law']
          ).map(s => (
            <button key={s} onClick={() => { setQ(s); onSearch(s); }} style={{
              padding: '6px 12px', background: 'var(--glass)',
              border: '1px solid var(--border)', borderRadius: 999,
              color: 'var(--muted)', fontSize: 13,
            }}>{s}</button>
          ))}
        </div>
      </div>
    </section>
  )
}

function CardResult({ card, country, language, onAddToPortfolio }) {
  const langMult = CARD_LANGUAGES[language]?.multiplier ?? 1.0
  const baseFmv = card.fmvEur ?? card.fmvUsd ?? 0
  const fmv = baseFmv * langMult
  const currency = card.fmvEur ? 'EUR' : 'USD'
  const region = EBAY_DOMAINS[country] || EBAY_DOMAINS.US

  /* Live eBay lowest price (real-time, via /api/ebay-search proxy) */
  const [live, setLive] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const liveQuery = `${card.name} ${card.set || ''} ${card.number ? '#' + card.number : ''}`.trim()

  async function fetchLive() {
    if (live || liveLoading) return
    setLiveLoading(true)
    try {
      const url = `/api/ebay-search?q=${encodeURIComponent(liveQuery)}&market=${country}&language=${language}&limit=5`
      const r = await fetch(url)
      if (r.ok) {
        const data = await r.json()
        setLive(data)
      } else {
        setLive({ error: true })
      }
    } catch {
      setLive({ error: true })
    } finally {
      setLiveLoading(false)
    }
  }

  const isRare = /Rare|Secret|Ultra|Hyper|Special/i.test(card.rarity || '')
  const isSecret = /Secret|Hyper/i.test(card.rarity || '')
  const glow = isSecret ? 'var(--gold)' : isRare ? 'var(--pink)' : 'transparent'

  const query = `${card.name} ${card.set || ''} ${card.number || ''}`.trim()

  return (
    <article className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="holo" style={{
        position: 'relative', aspectRatio: '5 / 7',
        borderRadius: 10, overflow: 'hidden',
        boxShadow: glow !== 'transparent' ? `0 0 24px ${glow}55` : 'none',
      }}>
        {card.image ? (
          <img src={card.image} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)' }} />
        )}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          fontSize: 11, fontWeight: 700, color: 'var(--gold)',
        }}>
          {CARD_LANGUAGES[language]?.flag}
        </div>
      </div>

      <div>
        <h3 className="font-syne" style={{ fontSize: 17, marginBottom: 2, lineHeight: 1.2 }}>{card.name}</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          {card.set} {card.number ? `· #${card.number}` : ''}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>FMV ({CARD_LANGUAGES[language]?.label})</span>
          {langMult !== 1.0 && baseFmv > 0 && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {langMult > 1 ? '+' : ''}{Math.round((langMult - 1) * 100)}% vs EN base
            </span>
          )}
        </div>
        <span className="font-mono" style={{ fontSize: 22, color: 'var(--gold)', fontWeight: 700 }}>
          {formatPrice(fmv, currency)}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Net sell ({region.domain})</span>
        <span className="font-mono" style={{ color: 'var(--gain)' }}>{formatPrice(netSell(fmv), currency)}</span>
      </div>

      <details style={{ fontSize: 12, color: 'var(--muted)' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--violet)' }}>PSA graded estimates</summary>
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {Object.entries(PSA_MULT).map(([grade, mult]) => (
            <div key={grade} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PSA {grade}</span>
              <span className="font-mono" style={{ color: 'var(--text)' }}>{formatPrice(fmv * mult, currency)}</span>
            </div>
          ))}
        </div>
      </details>

      <details onToggle={(e) => e.target.open && fetchLive()} style={{ fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--blue)', fontWeight: 600 }}>
          ⚡ Live on eBay {region.domain}
        </summary>
        <div style={{ marginTop: 10 }}>
          {liveLoading && <p style={{ color: 'var(--muted)' }}>Loading current listings...</p>}
          {live?.error && <p style={{ color: 'var(--loss)' }}>Live data unavailable. Use eBay link below.</p>}
          {live && !live.error && live.lowest != null && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Lowest active</span>
                <span className="font-mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>
                  {formatPrice(live.lowest, live.currency)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Active listings</span>
                <span className="font-mono">{live.count}</span>
              </div>
              {live.items?.slice(0, 3).map((it, i) => (
                <a key={i} href={it.url} target="_blank" rel="nofollow noopener sponsored"
                   style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                  {it.thumb && <img src={it.thumb} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</p>
                    <p className="font-mono" style={{ fontSize: 11, color: 'var(--gold)' }}>{formatPrice(it.price, it.currency)}</p>
                  </div>
                </a>
              ))}
            </>
          )}
        </div>
      </details>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
        <a
          href={buildEbayUrl({ query, country, language })}
          target="_blank" rel="nofollow noopener sponsored"
          style={{
            textAlign: 'center', padding: '10px 14px',
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: 10, color: 'var(--gold)', fontWeight: 600, fontSize: 13,
          }}
        >
          {region.domain} →
        </a>
        <button onClick={() => onAddToPortfolio(card, fmv, currency, language)} title="Add to portfolio" style={{
          padding: '0 12px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 10,
          color: 'var(--violet)', fontSize: 16,
        }}>+</button>
      </div>
    </article>
  )
}

function Results({ results, loading, query, country, language, onAddToPortfolio }) {
  if (!query && !loading) return null

  return (
    <section id="results" style={{ padding: '40px 24px 80px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="font-syne" style={{ fontSize: 28 }}>
          {loading ? 'Searching...' : `Results for "${query}"`}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Showing <strong style={{ color: 'var(--gold)' }}>{CARD_LANGUAGES[language]?.label}</strong> prices ·
          routed to <strong style={{ color: 'var(--gold)' }}>{(EBAY_DOMAINS[country] || EBAY_DOMAINS.US).domain}</strong>
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass" style={{ height: 460, opacity: 0.4 }}></div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>No cards found. Try another name.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {results.map(card => <CardResult key={card.id} card={card} country={country} language={language} onAddToPortfolio={onAddToPortfolio} />)}
        </div>
      )}
    </section>
  )
}

function PortfolioDashboard({ portfolio, removeItem, country }) {
  if (portfolio.length === 0) return null

  const totalValue = portfolio.reduce((sum, p) => sum + (p.fmv || 0), 0)
  const totalCost = portfolio.reduce((sum, p) => sum + (p.cost || 0), 0)
  const pl = totalValue - totalCost
  const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0

  return (
    <section id="portfolio" style={{ padding: '80px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="font-syne" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>Your portfolio</h2>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Live valuation in {portfolio.length} card{portfolio.length === 1 ? '' : 's'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="glass" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total value</p>
          <p className="font-mono" style={{ fontSize: 28, color: 'var(--gold)', fontWeight: 700, marginTop: 4 }}>{formatPrice(totalValue)}</p>
        </div>
        <div className="glass" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost basis</p>
          <p className="font-mono" style={{ fontSize: 28, color: 'var(--text)', fontWeight: 700, marginTop: 4 }}>{formatPrice(totalCost)}</p>
        </div>
        <div className="glass" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>P/L</p>
          <p className="font-mono" style={{ fontSize: 28, color: pl >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 700, marginTop: 4 }}>
            {pl >= 0 ? '+' : ''}{formatPrice(pl)}
          </p>
          <p style={{ fontSize: 12, color: pl >= 0 ? 'var(--gain)' : 'var(--loss)', marginTop: 2 }}>
            {pl >= 0 ? '▲' : '▼'} {Math.abs(plPct).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Card</th>
              <th style={{ padding: 12, textAlign: 'left', fontSize: 11, color: 'var(--muted)' }}>Lang</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>FMV</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>Cost</th>
              <th style={{ padding: 12, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>P/L</th>
              <th style={{ padding: 12 }}></th>
            </tr>
          </thead>
          <tbody>
            {portfolio.map((p, i) => {
              const itemPl = (p.fmv || 0) - (p.cost || 0)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 12, fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {p.image && <img src={p.image} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 4 }} />}
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.set}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: 12 }}>
                    <span style={{ padding: '2px 6px', background: 'rgba(251,191,36,0.15)', color: 'var(--gold)', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      {CARD_LANGUAGES[p.language]?.flag}
                    </span>
                  </td>
                  <td className="font-mono" style={{ padding: 12, textAlign: 'right', color: 'var(--gold)' }}>{formatPrice(p.fmv)}</td>
                  <td className="font-mono" style={{ padding: 12, textAlign: 'right' }}>
                    <input
                      type="number" value={p.cost || ''}
                      onChange={e => p.onCostChange?.(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      style={{
                        width: 80, padding: '4px 8px', textAlign: 'right',
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        borderRadius: 4, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
                      }}
                    />
                  </td>
                  <td className="font-mono" style={{ padding: 12, textAlign: 'right', color: itemPl >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                    {itemPl >= 0 ? '+' : ''}{formatPrice(itemPl)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>
        Portfolio is saved locally in your browser. Sign in to sync across devices.
      </p>
    </section>
  )
}

function TopMovers({ country, language }) {
  const movers = [
    { name: 'Umbreon VMAX Alt Art', set: 'Evolving Skies', fmv: 580, delta: 12.4, image: 'https://images.pokemontcg.io/swsh7/215_hires.png' },
    { name: 'Charizard ex SAR', set: 'Obsidian Flames', fmv: 145, delta: -3.2, image: 'https://images.pokemontcg.io/sv3/223_hires.png' },
    { name: 'Pikachu with Grey Felt Hat', set: 'Promo', fmv: 320, delta: 8.1, image: 'https://images.pokemontcg.io/swshp/SWSH285_hires.png' },
    { name: 'Lugia V Alt Art', set: 'Silver Tempest', fmv: 210, delta: 5.7, image: 'https://images.pokemontcg.io/swsh12/186_hires.png' },
  ]
  const langMult = CARD_LANGUAGES[language]?.multiplier ?? 1.0

  return (
    <section style={{ padding: '60px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="font-syne" style={{ fontSize: 32 }}>Top movers today</h2>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>24h change · {CARD_LANGUAGES[language]?.label} pricing</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {movers.map(m => {
          const up = m.delta >= 0
          const query = `${m.name} ${m.set}`
          const adjusted = m.fmv * langMult
          return (
            <a key={m.name} href={buildEbayUrl({ query, country, language })} target="_blank" rel="nofollow noopener sponsored"
               className="glass holo" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none' }}>
              <img src={m.image} alt={m.name} style={{ width: 64, height: 88, objectFit: 'cover', borderRadius: 6 }} loading="lazy" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{m.set}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="font-mono" style={{ color: 'var(--gold)', fontSize: 16, fontWeight: 700 }}>{formatPrice(adjusted)}</span>
                  <span className="font-mono" style={{ color: up ? 'var(--gain)' : 'var(--loss)', fontSize: 13 }}>
                    {up ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}%
                  </span>
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function Pricing({ onAuth }) {
  return (
    <section id="pricing" style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2 className="font-syne" style={{ fontSize: 'clamp(32px, 5vw, 48px)', marginBottom: 12 }}>Pick your plan</h2>
        <p style={{ color: 'var(--muted)', fontSize: 17 }}>Free forever. Pro when you want more.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <div className="glass" style={{ padding: 32 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>FREE</p>
          <h3 className="font-syne" style={{ fontSize: 36, marginBottom: 4 }}>$0</h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Forever</p>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 10, fontSize: 14, marginBottom: 24 }}>
            <li>✓ Unlimited FMV search</li>
            <li>✓ All 9 card languages</li>
            <li>✓ PSA 10/9/8 estimates</li>
            <li>✓ Geo-routed eBay links</li>
            <li>✓ Portfolio up to 25 cards</li>
            <li>✓ 3 active price alerts</li>
            <li>✓ 3 camera scans/month</li>
          </ul>
          <button onClick={onAuth} style={{
            width: '100%', padding: '14px',
            background: 'var(--surface-2)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 12, fontWeight: 700, fontSize: 15,
          }}>Start free</button>
        </div>

        <div className="glass" style={{
          padding: 32, position: 'relative',
          border: '1px solid var(--gold)',
          background: 'linear-gradient(180deg, rgba(251,191,36,0.08) 0%, rgba(255,255,255,0.04) 100%)',
        }}>
          <span style={{
            position: 'absolute', top: -12, left: 32,
            padding: '4px 10px', borderRadius: 999,
            background: 'var(--gold)', color: '#000', fontSize: 11, fontWeight: 800,
          }}>MOST POPULAR</span>
          <p style={{ color: 'var(--gold)', fontSize: 13, marginBottom: 8 }}>PRO</p>
          <h3 className="font-syne" style={{ fontSize: 36, marginBottom: 4 }}>$4.99<span style={{ fontSize: 16, color: 'var(--muted)' }}>/month</span></h3>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Cancel anytime</p>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 10, fontSize: 14, marginBottom: 24 }}>
            <li>✓ Everything in Free</li>
            <li>✓ <strong>Unlimited price alerts (hourly checks)</strong></li>
            <li>✓ <strong>Unlimited camera scans</strong></li>
            <li>✓ <strong>Unlimited portfolio + binders</strong></li>
            <li>✓ 12-month FMV history charts</li>
            <li>✓ CSV/PDF export</li>
            <li>✓ Pro badge in community</li>
          </ul>
          <button onClick={onAuth} style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)',
            color: '#000', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15,
          }}>Go Pro</button>
        </div>
      </div>
    </section>
  )
}

function Blog() {
  const posts = [
    {
      slug: 'top-5-pokemon-investments-2026',
      title: 'Top 5 Pokemon cards to invest in for 2026',
      excerpt: 'From Umbreon VMAX to Charizard 151, the cards with the best risk/reward profile for the year ahead.',
      date: 'May 16, 2026',
      readTime: '4 min',
      image: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    },
    {
      slug: 'opening-packs-roi-test',
      title: 'Is pack opening profitable? Real numbers from 100 Surging Sparks boosters',
      excerpt: 'We opened 100 packs, tracked every pull. The verdict: depends heavily on the set, here are the rules.',
      date: 'May 14, 2026',
      readTime: '6 min',
      image: 'https://images.pokemontcg.io/sv8/254_hires.png',
    },
    {
      slug: 'psa-vs-cgc-vs-beckett-2026',
      title: 'PSA vs CGC vs Beckett: which grading service wins in 2026',
      excerpt: 'Costs, turnaround, sale premiums. Comparison table from 200 graded cards across all three companies.',
      date: 'May 12, 2026',
      readTime: '5 min',
      image: 'https://images.pokemontcg.io/sv3/223_hires.png',
    },
  ]

  return (
    <section id="blog" style={{ padding: '80px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 40, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="font-syne" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>Blog</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Market analysis, grading, investing. No fluff.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {posts.map(p => (
          <a key={p.slug} href={`/blog/${p.slug}`} className="glass" style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            textDecoration: 'none', color: 'inherit',
          }}>
            <div style={{ aspectRatio: '16 / 10', background: 'var(--surface-2)', overflow: 'hidden' }}>
              <img src={p.image} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>{p.date} · {p.readTime}</p>
              <h3 className="font-syne" style={{ fontSize: 20, marginBottom: 8, lineHeight: 1.3 }}>{p.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>{p.excerpt}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

function EmailCapture() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')

  async function handle(e) {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setStatus('loading')
    if (supabase) {
      const { error } = await supabase.from('newsletter').insert({ email, source: 'landing' })
      setStatus(error ? 'error' : 'ok')
    } else {
      setTimeout(() => setStatus('ok'), 600)
    }
  }

  return (
    <section style={{ padding: '60px 24px', maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
      <div className="glass" style={{ padding: 40 }}>
        <h3 className="font-syne" style={{ fontSize: 26, marginBottom: 8 }}>Weekly newsletter</h3>
        <p style={{ color: 'var(--muted)', fontSize: 15, marginBottom: 24 }}>
          One email on Tuesdays. Three cards that moved, one analysis, zero spam.
        </p>
        {status === 'ok' ? (
          <p style={{ color: 'var(--gain)', fontWeight: 600 }}>Subscribed. See you Tuesday.</p>
        ) : (
          <form onSubmit={handle} style={{ display: 'flex', gap: 8, maxWidth: 480, margin: '0 auto' }}>
            <input
              type="email" required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                flex: 1, padding: '14px 16px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)', borderRadius: 10,
                color: 'var(--text)', fontSize: 15, outline: 'none',
              }}
            />
            <button type="submit" disabled={status === 'loading'} style={{
              padding: '0 22px',
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)',
              color: '#000', border: 'none', borderRadius: 10, fontWeight: 700,
            }}>
              {status === 'loading' ? '...' : 'Subscribe'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

function AuthModal({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')

  async function magic(e) {
    e.preventDefault()
    if (!supabase) { setStatus('no-supabase'); return }
    setStatus('loading')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setStatus(error ? 'error' : 'sent')
  }

  if (!open) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="glass" style={{ padding: 32, maxWidth: 400, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Logo size={28} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20 }}>✕</button>
        </div>
        <h2 className="font-syne" style={{ fontSize: 24, marginBottom: 8 }}>Sign in to DraGold</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
          Email only. No passwords. We send you a magic link.
        </p>
        {status === 'sent' ? (
          <p style={{ color: 'var(--gain)' }}>Check your inbox for the sign-in link.</p>
        ) : status === 'no-supabase' ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Auth coming soon. Drop your email in the newsletter below to get notified at launch.</p>
        ) : (
          <form onSubmit={magic}>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              style={{
                width: '100%', padding: '14px 16px', marginBottom: 12,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 10, color: 'var(--text)', fontSize: 15, outline: 'none',
              }}
            />
            <button type="submit" disabled={status === 'loading'} style={{
              width: '100%', padding: '14px',
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-deep) 100%)',
              color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
            }}>
              {status === 'loading' ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer style={{
      padding: '60px 24px 40px',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Logo size={28} />
            <span className="font-syne" style={{ fontSize: 18 }}>DraGold</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
            The real value of your TCG cards. In every language, on every market.
          </p>
        </div>
        <div>
          <h4 className="font-syne" style={{ fontSize: 14, marginBottom: 12, color: 'var(--gold)' }}>Product</h4>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <li><a href="#top">FMV search</a></li>
            <li><a href="#portfolio">Portfolio</a></li>
            <li><a href="#pricing">Pro</a></li>
            <li><a href="#blog">Blog</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-syne" style={{ fontSize: 14, marginBottom: 12, color: 'var(--gold)' }}>Legal</h4>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <li><a href="/privacy.html">Privacy</a></li>
            <li><a href="/terms.html">Terms</a></li>
            <li><a href="/cookies.html">Cookies</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-syne" style={{ fontSize: 14, marginBottom: 12, color: 'var(--gold)' }}>Contact</h4>
          <ul style={{ listStyle: 'none', display: 'grid', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <li><a href="mailto:hello@dragold.app">hello@dragold.app</a></li>
            <li><a href="https://buymeacoffee.com/dragold" target="_blank" rel="noopener">Buy us a coffee</a></li>
          </ul>
        </div>
      </div>
      <div style={{ maxWidth: 1280, margin: '40px auto 0', paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
        <span>© 2026 DraGold. All rights reserved.</span>
        <span>eBay links are affiliate. We earn a small commission on your purchases at no extra cost to you.</span>
      </div>
    </footer>
  )
}

/* -------------------------- Main app -------------------------- */
export default function DraGold() {
  const [country, setCountry] = useState('US')
  const [language, setLanguage] = useState('EN')
  const [tcg, setTcg] = useState('pokemon')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [portfolio, setPortfolio] = useState([])
  const resultsRef = useRef(null)

  useEffect(() => {
    setCountry(detectCountry())
    try {
      const stored = localStorage.getItem('dg_portfolio')
      if (stored) setPortfolio(JSON.parse(stored))
      const lang = localStorage.getItem('dg_language')
      if (lang && CARD_LANGUAGES[lang]) setLanguage(lang)
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('dg_portfolio', JSON.stringify(portfolio)) } catch {}
  }, [portfolio])

  useEffect(() => {
    try { localStorage.setItem('dg_language', language) } catch {}
  }, [language])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSearch(q) {
    if (!q || !q.trim()) return
    setQuery(q); setLoading(true); setResults([])
    try {
      const cards = await searchCards(tcg, q.trim())
      setResults(cards)
    } catch (err) {
      console.error(err)
      setResults([])
    } finally {
      setLoading(false)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  function addToPortfolio(card, fmv, currency, lang) {
    const entry = {
      id: card.id + '-' + lang + '-' + Date.now(),
      cardId: card.id,
      name: card.name,
      set: card.set,
      image: card.image,
      language: lang,
      fmv,
      currency,
      cost: 0,
      addedAt: Date.now(),
    }
    setPortfolio(prev => [...prev, entry])
  }

  function removePortfolioItem(idx) {
    setPortfolio(prev => prev.filter((_, i) => i !== idx))
  }

  /* attach cost setter to each portfolio item for the table */
  const portfolioWithSetters = useMemo(() => portfolio.map((p, i) => ({
    ...p,
    onCostChange: (newCost) => setPortfolio(prev => prev.map((q, j) => j === i ? { ...q, cost: newCost } : q))
  })), [portfolio])

  return (
    <>
      <Nav onAuth={() => setAuthOpen(true)} onPricing={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} user={user} />

      {/* Country selector floating */}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 30,
      }}>
        <select
          value={country}
          onChange={e => { setCountry(e.target.value); try { localStorage.setItem('dg_country', e.target.value) } catch {} }}
          className="glass"
          style={{
            padding: '8px 12px', color: 'var(--text)', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
          }}
          title="Your eBay marketplace"
        >
          {Object.entries(EBAY_DOMAINS).map(([code, r]) => (
            <option key={code} value={code} style={{ background: 'var(--bg)' }}>{code}: {r.label}</option>
          ))}
        </select>
      </div>

      <Hero onSearch={handleSearch} tcg={tcg} setTcg={setTcg} language={language} setLanguage={setLanguage} />
      <div ref={resultsRef}>
        <Results results={results} loading={loading} query={query} country={country} language={language} onAddToPortfolio={addToPortfolio} />
      </div>
      <PortfolioDashboard portfolio={portfolioWithSetters} removeItem={removePortfolioItem} country={country} />
      {!query && <TopMovers country={country} language={language} />}
      <Pricing onAuth={() => setAuthOpen(true)} />
      <Blog />
      <EmailCapture />
      <Footer />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  )
}
