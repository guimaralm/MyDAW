import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useProjectStore } from './stores/projectStore.ts'

if (import.meta.env.DEV) {
  ;(window as unknown as { __projectStore: typeof useProjectStore }).__projectStore = useProjectStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
