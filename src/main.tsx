import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found: index.html may be damaged.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
