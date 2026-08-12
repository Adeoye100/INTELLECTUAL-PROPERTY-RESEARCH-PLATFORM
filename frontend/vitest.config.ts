import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/lib/test-setup.ts',
    // The complete jsdom suite is memory-heavy; serial workers keep CI timing deterministic.
    maxWorkers: 1,
    testTimeout: 20_000,
  },
});
