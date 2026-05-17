import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import DraGold from './DraGold.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DraGold />
    <Analytics />
  </StrictMode>,
)
