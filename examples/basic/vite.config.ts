import compiler from '@motifx/compiler';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { panelPlugin } from '../../scripts/panel';

// The example imports the package by its published name, resolved to the source here,
// so it always runs against the current code without a build step.
export default defineConfig({
  base: './',
  plugins: [compiler(), panelPlugin()],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: { '@motifx-community/devtools': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    dedupe: ['@motifx/core'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
    },
  },
});
