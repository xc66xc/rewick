import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: {
    input: { index: resolve('src/main/index.ts'), 'document-worker': resolve('src/main/services/document-worker.mjs'), 'document-store-worker': resolve('src/main/services/document-store-worker.mjs') },
    output: { entryFileNames: (entry) => entry.name.endsWith('-worker') ? '[name].mjs' : '[name].js' },
  } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { plugins: [react()], server: { host: '127.0.0.1' } }
})
