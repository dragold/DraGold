import { StrictMode, Suspense, lazy, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from './lib/auth.js'
import { TCG_HUBS } from './lib/tcgConfig.js'
import NightSky from './components/atmosphere/NightSky.jsx'
import './styles.css'

// Global error boundary — catches React errors anywhere in the tree and renders
// a graceful fallback instead of crashing the whole page. Placed OUTSIDE the
// lazy-loaded routes so even a crash in a lazy chunk is caught.
import { ErrorBoundary } from './components/shared/ErrorBoundary.jsx'

// Every route is its own lazy chunk — a visitor to /carta/… never downloads
// the SPA shell (DraGold.jsx) or /account, and vice-versa.
const DraGold = lazy(() => import('./DraGold.jsx'))
const CardPage = lazy(() => import('./pages/card/CardPage.jsx'))
const SetPage = lazy(() => import('./pages/set/SetPage.jsx'))
const TcgPage = lazy(() => import('./pages/tcg/TcgPage.jsx'))
const IllustratorPage = lazy(() => import('./pages/illustrator/IllustratorPage.jsx'))
const AcademyPage = lazy(() => import('./pages/academy/AcademyPage.jsx'))
const AcademyLessonPage = lazy(() => import('./pages/academy/AcademyLessonPage.jsx'))
const CardIdPage = lazy(() => import('./pages/card-id/CardIdPage.jsx'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage.jsx'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage.jsx'))
const AccountPage = lazy(() => import('./pages/auth/AccountPage.jsx'))
const TermsPage = lazy(() => import('./pages/legal/TermsPage.jsx'))
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage.jsx'))
const CookiePolicyPage = lazy(() => import('./pages/legal/CookiePolicyPage.jsx'))

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

// NightSky is the global atmosphere layer (fixed, z-index:0, aria-hidden).
// Everything else renders inside .dg-root, which is the stacking context that
// sits ABOVE the sky so page content is never obscured.
createRoot(document.getElementById('root')).render(
  h(StrictMode, null,
    h(AuthProvider, null,
      h(ErrorBoundary, null,
        h(NightSky, null),
        h('div', { className: 'dg-root' },
          h(Suspense, { fallback: h('div', { style: { minHeight: '100svh', background: '#05060B' } }) }, RootView)
        ),
      ),
      h(Analytics, null),
    ),
  ),
)
