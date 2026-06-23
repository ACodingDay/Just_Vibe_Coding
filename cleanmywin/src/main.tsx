import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'sonner/dist/styles.css'
import './index.css'
import App from './App.tsx'

// 全局禁用鼠标右键
document.addEventListener("contextmenu", e => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)