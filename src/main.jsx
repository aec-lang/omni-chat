import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './contexts/AppContext'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'
import { Capacitor } from '@capacitor/core'
import { initializeCredentials } from './utils/native'

const root = createRoot(document.getElementById('root'))

async function start() {
  try {
    const initialData = await initializeCredentials()
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <AppProvider initialData={initialData}>
            <App />
          </AppProvider>
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch {
    root.render(<main className="startup-error" role="alert">
      <h1>OmniChat</h1>
      <p>Could not open saved connection settings. Unlock your device and retry. Your existing data has been kept.</p>
      <button className="primary-button" onClick={start}>Retry / تلاش دوباره</button>
    </main>)
  }
}

start()

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => {
      // Offline support is optional; the app remains fully usable if registration is blocked.
    })
  })
}
