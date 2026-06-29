import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './components/shared/DesignTokens.css'
import './lib/i18n'
import { App } from './App'
import { vacuum } from './lib/export'

// Invariant 3: vacuum all session data at page unload
window.addEventListener('beforeunload', () => {
  vacuum()
})

createRoot(document.getElementById('app-root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
