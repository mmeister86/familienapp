import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider } from 'convex/react'
import { BrowserRouter } from 'react-router'
import App from '@/App'
import { convex } from '@/lib/convex'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
)
