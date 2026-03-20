import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { startLiveGameClient } from './liveGameClient'
import { queryClient } from './queryClient'
import { installSoundEffects } from './soundEffects'

installSoundEffects()
startLiveGameClient()

let root = document.getElementById('root');
if (!root) {
  console.error("Missing DOM root. Using body.");
  root = document.body;
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
