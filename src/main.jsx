import { StrictMode, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import DraGold from './DraGold.jsx'
import CardPage from './pages/card/CardPage.jsx'
import SetPage from './pages/set/SetPage.jsx'
import TcgPage from './pages/tcg/TcgPage.jsx'
import IllustratorPage from './pages/illustrator/IllustratorPage.jsx'
import { TCG_HUBS } from './lib/tcgConfig.js'
import './styles.css'

const cardMatch = window.location.pathname.match(/^\/carta\/([^/]+)\/?$/)
// Block 5 — SEO Foundation for Sets: /set/{slug} e' una pagina standalone come
// /carta/{slug}, stesso pattern di routing (match sul pathname prima di montare
// la SPA normale).
const setMatch = window.location.pathname.match(/^\/set\/([^/]+)\/?$/)
// Blocco "Illustrator Pages": stesso pattern, /illustrator/{slug} e' un'entita'
// globale (non scoped a un singolo tcg, vedi src/lib/illustratorSlug.js).
const illustratorMatch = window.location.pathname.match(/^\/illustrator\/([^/]+)\/?$/)
// Block 6 — TCG Hub SEO Foundation: SOLO le 4 URL esatte /pokemon, /onepiece,
// /mtg, /ygo sono TCG Hub validi (match esatto sull'elenco statico, non un
// wildcard a singolo segmento — cosi' nessun'altra route top-level esistente o
// futura viene intercettata per errore).
const pathNoSlash = window.location.pathname.replace(/\/$/, '') || '/'
const tcgMatch = TCG_HUBS.find(hub => `/${hub.tcg}` === pathNoSlash)
const RootView = cardMatch ? h(CardPage, { slug: decodeURIComponent(cardMatch[1]) })
  : setMatch ? h(SetPage, { slug: decodeURIComponent(setMatch[1]) })
  : illustratorMatch ? h(IllustratorPage, { slug: decodeURIComponent(illustratorMatch[1]) })
  : tcgMatch ? h(TcgPage, { tcg: tcgMatch.tcg })
  : h(DraGold, null)

createRoot(document.getElementById('root')).render(
  h(StrictMode, null, RootView, h(Analytics, null))
  )
