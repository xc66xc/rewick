import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
// 顺序即层序：global.css 先进包(@layer theme, base, legacy, utilities 声明生效)，tokens.css 后进；
// 基建期旧页面视觉零变化，皮肤 pass 的 utilities 可压过 legacy 层。详见 global.css 头部注释。
import './styles/tokens.css'

const root = document.getElementById('root')
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)
