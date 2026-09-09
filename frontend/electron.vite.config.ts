import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const platformUrl = process.env.COPILOT_PLATFORM_URL?.trim() || 'http://127.0.0.1:8080'
const parsed = new URL(platformUrl)
if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('COPILOT_PLATFORM_URL must use HTTP or HTTPS.')
if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('COPILOT_PLATFORM_URL must not contain credentials, query or fragment.')
const define = { __COPILOT_PLATFORM_URL__: JSON.stringify(platformUrl.replace(/\/+$/, '')) }

export default defineConfig({
  main: { define, plugins: [externalizeDepsPlugin()], build: { rollupOptions: {
    input: { index: resolve('src/main/index.ts'), 'document-worker': resolve('src/main/services/document-worker.mjs'), 'document-store-worker': resolve('src/main/services/document-store-worker.mjs') },
    output: { entryFileNames: (entry) => entry.name.endsWith('-worker') ? '[name].mjs' : '[name].js' },
  } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { define, plugins: [react()], server: { host: '127.0.0.1' } }
})
