import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // MSW is a development-only aid. Its source stays in public/ for the
      // local development server, but it must not be shipped with a launch
      // build where mock data is deliberately unavailable.
      name: 'omit-development-mock-service-worker',
      apply: 'build',
      async closeBundle() {
        await rm('dist/mockServiceWorker.js', { force: true })
      },
    },
  ],
  build: {
    // The 3D landing scene is an optional, capability-gated lazy chunk. The
    // critical application chunk is kept below 500 kB; allow the isolated
    // Three.js experience without weakening or removing the landing design.
    chunkSizeWarningLimit: 600,
    sourcemap: false,
  },
})
