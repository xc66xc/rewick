import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { assertPlatformTransport, productionPlatformUrl } from './src/shared/platform-transport'

const platformUrl = process.env.COPILOT_PLATFORM_URL?.trim() || productionPlatformUrl
assertPlatformTransport(platformUrl)
const define = { __COPILOT_PLATFORM_URL__: JSON.stringify(platformUrl.replace(/\/+$/, '')) }

export default defineConfig({
  main: { define, plugins: [externalizeDepsPlugin()], build: { rollupOptions: {
    input: { index: resolve('src/main/index.ts'), 'document-worker': resolve('src/main/services/document-worker.mjs') },
    output: { entryFileNames: (entry) => entry.name.endsWith('-worker') ? '[name].mjs' : '[name].js' },
  } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { define, plugins: [react(), tailwindcss()], server: { host: '127.0.0.1' } }
})
