import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DraGold from './DraGold.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DraGold />
  </StrictMode>,
)
