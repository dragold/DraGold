import { StrictMode, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import DraGold from './DraGold.jsx'
import CardPage from './pages/card/CardPage.jsx'
import './styles.css'

const cardMatch = window.location.pathname.match(/^\/carta\/([^/]+)\/?$/)
const RootView = cardMatch ? h(CardPage, { slug: decodeURIComponent(cardMatch[1]) }) : h(DraGold, null)

createRoot(document.getElementById('root')).render(
  h(StrictMode, null, RootView, h(Analytics, null))
  )
