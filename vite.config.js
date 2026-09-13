import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages repo name
  base: '/art-museum/',
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    open: true,
  },
});
