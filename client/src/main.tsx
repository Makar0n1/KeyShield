import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './locales/i18n'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Signal that JS is hydrated — enables scroll animations
// Without this class, CSS keeps all [data-animate] elements visible for SEO bots
// Skip for prerender bot so crawlers see opacity: 1
if (!navigator.userAgent.includes('Prerender')) {
  requestAnimationFrame(() => {
    document.documentElement.classList.add('js-ready')
  })
}
