import compiler from '@motifx/compiler';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = `${root}extension/`;
const out = `${root}dist-extension/`;
const firefoxOut = `${root}dist-extension-firefox/`;
const GECKO_ID = 'devtools@motifjs.com';
const FIREFOX_MIN = '128.0';
const version = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version;
const resolve = { extensions: ['.tsx', '.ts', '.jsx', '.js'], dedupe: ['@motifx/core'] };

rmSync(out, { recursive: true, force: true });
rmSync(firefoxOut, { recursive: true, force: true });
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

const writeManifest = (dir, value) => writeFileSync(`${dir}manifest.json`, `${JSON.stringify(value, null, 2)}\n`);
const manifest = { ...JSON.parse(readFileSync(`${source}manifest.json`, 'utf8')), version };
cpSync(`${source}icons`, `${out}icons`, { recursive: true });
writeManifest(out, manifest);

cpSync(out, firefoxOut, { recursive: true });
const { minimum_chrome_version: _chrome, ...firefox } = manifest;
writeManifest(firefoxOut, {
  ...firefox,
  background: { scripts: [manifest.background.service_worker] },
  browser_specific_settings: {
    gecko: { id: GECKO_ID, strict_min_version: FIREFOX_MIN, data_collection_permissions: { required: ['none'] } },
  },
});

console.log(`MotifJS DevTools ${version} extension written to dist-extension/ (Chrome, Edge) and dist-extension-firefox/ (Firefox)`);
