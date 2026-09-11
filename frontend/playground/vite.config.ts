import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 组件预览站(2026-09-11 用户确认常驻,不随阶段 1 删除):改组件后于此即时预览。
 * 只读 src/renderer/src(别名 @),独立构建,不参与 electron-vite 主构建与安装包;
 * 依赖方向单向:playground → components/ui,主应用页面不得反向引用本目录。
 */
const here = (p: string) => resolve(fileURLToPath(new URL('.', import.meta.url)), p)

export default defineConfig({
  root: here('.'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': here('../src/renderer/src') },
  },
  server: { port: 5175, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true },
})
