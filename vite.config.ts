/// <reference types="vitest/config" />
import compiler from '@motifx/compiler';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { panelPlugin } from './scripts/panel';

// Library build. The compiler lowers JSX to bindings before publishing, so consumers need no compiler setup.
// The panel is built with its own copy of @motifx/core into one HTML page and loaded only when it opens.
export default defineConfig({
  plugins: [compiler(), panelPlugin()],
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    // @motifx/core stays outside: two copies would mean two reactivity engines.
    rollupOptions: { external: [/^@motifx\/core/], output: { chunkFileNames: 'panel-[hash].js' } },
    sourcemap: true,
    minify: false,
    target: 'es2021',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
