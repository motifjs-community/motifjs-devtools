import compiler from '@motifx/compiler';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// The example imports the package by its published name, resolved to the source here,
// so it always runs against the current code without a build step.
export default defineConfig({
  base: './',
  plugins: [compiler()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: { '@motifx-community/devtools': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    dedupe: ['@motifx/core'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        panel: fileURLToPath(new URL('./panel.html', import.meta.url)),
      },
    },
  },
});
