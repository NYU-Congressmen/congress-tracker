/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Read the shared .env at the repo root. Only VITE_ variables reach the browser.
  envDir: '..',
  server: {
    port: 5173,
    strictPort: true,
    // Forward API calls to FastAPI so the browser only ever talks to one origin.
    // Defaults to the local dev backend; API_PROXY_TARGET points it elsewhere
    // (for example a backend running on a different port).
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
