import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './tokens.css'
const element = document.getElementById('root')
if (!element) throw new Error('页面根节点不存在。')
ReactDOM.createRoot(element).render(<React.StrictMode><App /></React.StrictMode>)
