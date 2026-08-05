import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The 3D landing scene is an optional, capability-gated lazy chunk. The
    // critical application chunk is kept below 500 kB; allow the isolated
    // Three.js experience without weakening or removing the landing design.
    chunkSizeWarningLimit: 600,
  },
})
