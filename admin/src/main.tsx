import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyAppearance, readAppearance } from './appearance'
import './tokens.css'
import './motion.css'
applyAppearance(readAppearance())
const element = document.getElementById('root')
if (!element) throw new Error('页面根节点不存在。')
ReactDOM.createRoot(element).render(<React.StrictMode><App /></React.StrictMode>)
