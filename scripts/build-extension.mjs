import compiler from '@motifx/compiler';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = `${root}extension/`;
const out = `${root}dist-extension/`;
const version = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;
const resolve = { extensions: ['.tsx', '.ts', '.jsx', '.js'], dedupe: ['@motifx/core'] };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  root: source,
  base: './',
  plugins: [compiler()],
  resolve,
  build: {
    outDir: out,
    emptyOutDir: false,
    target: 'es2021',
    modulePreload: false,
    rollupOptions: {
      input: { panel: `${source}panel.html`, devtools: `${source}devtools.html`, popup: `${source}popup.html` },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
});

for (const name of ['background', 'content', 'detector', 'page']) {
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve,
    build: {
      outDir: out,
      emptyOutDir: false,
      target: 'es2021',
      lib: { entry: `${source}entries/${name}.ts`, formats: ['iife'], name: `MotifDevtools_${name}`, fileName: () => `${name}.js` },
    },
  });
}

const manifest = JSON.parse(readFileSync(`${source}manifest.json`, 'utf8'));
manifest.version = version;
writeFileSync(`${out}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
cpSync(`${source}icons`, `${out}icons`, { recursive: true });

console.log(`MotifJS DevTools ${version} extension written to dist-extension/`);
