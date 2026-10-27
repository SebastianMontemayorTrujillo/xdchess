import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // The 3D board chunk is mostly Three.js (~590 kB, ~150 kB gzipped). It is loaded on demand,
    // only when 3D view is used, so its size doesn't slow down the first page load.
    chunkSizeWarningLimit: 700,
  },
});
