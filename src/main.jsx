import { StrictMode, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import DraGold from './DraGold.jsx'
import CardPage from './pages/card/CardPage.jsx'
import SetPage from './pages/set/SetPage.jsx'
import TcgPage from './pages/tcg/TcgPage.jsx'
import IllustratorPage from './pages/illustrator/IllustratorPage.jsx'
import AcademyPage from './pages/academy/AcademyPage.jsx'
import AcademyLessonPage from './pages/academy/AcademyLessonPage.jsx'
import CardIdPage from './pages/card-id/CardIdPage.jsx'
import LoginPage from './pages/auth/LoginPage.jsx'
import RegisterPage from './pages/auth/RegisterPage.jsx'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/auth/ResetPasswordPage.jsx'
import AccountPage from './pages/auth/AccountPage.jsx'
import TermsPage from './pages/legal/TermsPage.jsx'
import PrivacyPage from './pages/legal/PrivacyPage.jsx'
import CookiePolicyPage from './pages/legal/CookiePolicyPage.jsx'
import { AuthProvider } from './lib/auth.js'
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

// Academy MVP (Task 4) - same standalone-route pattern as /carta, /set,
// /illustrator above: /academy is the list/hub, /academy/{slug} a single
// lesson.
const academyLessonMatch = window.location.pathname.match(/^\/academy\/([^/]+)\/?$/)
const isAcademyRoot = (window.location.pathname.replace(/\/$/, '') || '/') === '/academy'
// Block 6 — TCG Hub SEO Foundation: SOLO le 4 URL esatte /pokemon, /onepiece,
// /mtg, /ygo sono TCG Hub validi (match esatto sull'elenco statico, non un
// wildcard a singolo segmento — cosi' nessun'altra route top-level esistente o
// futura viene intercettata per errore).
const pathNoSlash = window.location.pathname.replace(/\/$/, '') || '/'
const tcgMatch = TCG_HUBS.find(hub => `/${hub.tcg}` === pathNoSlash)

// Auth/Profile/Username feature — standalone routes, same pattern as the
// blocks above (exact-match on pathNoSlash, mounted before the SPA shell).
// Card ID microproduct (2026-08-26) reuses this same exact-match map for
// /card-id: it's a single static page, same shape as /account etc., not
// worth a dedicated match variable for one more route.
const AUTH_ROUTES = {
  '/card-id': CardIdPage,
  '/login': LoginPage,
  '/register': RegisterPage,
  '/forgot-password': ForgotPasswordPage,
  '/reset-password': ResetPasswordPage,
  '/account': AccountPage,
  '/terms': TermsPage,
  '/privacy': PrivacyPage,
  '/cookie-policy': CookiePolicyPage,
}
const authRouteComp = AUTH_ROUTES[pathNoSlash]

const RootView = cardMatch ? h(CardPage, { slug: decodeURIComponent(cardMatch[1]) })
  : academyLessonMatch ? h(AcademyLessonPage, { slug: decodeURIComponent(academyLessonMatch[1]) })
  : isAcademyRoot ? h(AcademyPage, null)
  : setMatch ? h(SetPage, { slug: decodeURIComponent(setMatch[1]) })
  : illustratorMatch ? h(IllustratorPage, { slug: decodeURIComponent(illustratorMatch[1]) })
  : tcgMatch ? h(TcgPage, { tcg: tcgMatch.tcg })
  : authRouteComp ? h(authRouteComp, null)
  : h(DraGold, null)

createRoot(document.getElementById('root')).render(
  h(StrictMode, null,
    h(AuthProvider, null, RootView, h(Analytics, null))
  )
  )
