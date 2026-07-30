import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Captured at build time. On Cloudflare Pages the build runs on push, so this
    // is effectively the deploy/push time. Stored as a UTC ISO instant; the UI
    // renders it in the viewer's local timezone.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
