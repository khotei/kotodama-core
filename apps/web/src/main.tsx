import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

function App() {
  return <h1 className="text-2xl font-bold">LexiAI</h1>
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
