import compiler from '@motifx/compiler';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { panelPlugin } from '../../scripts/panel';

// The example imports the package by its published name, resolved to the source here,
// so it always runs against the current code without a build step.
// Its build is the demo on GitHub Pages, so it keeps what the panel reads: the development-only hooks of MotifJS
// (a production build removes them), store names, and class names (minifying shortens them).
export default defineConfig({
  base: './',
  plugins: [compiler({ production: false, storeNames: true }), panelPlugin()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: { '@motifx-community/devtools': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    dedupe: ['@motifx/core'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
    },
  },
});
