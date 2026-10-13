import compiler from '@motifx/compiler';
import { fileURLToPath, URL } from 'node:url';
import { build, type Plugin } from 'vite';

export const PANEL_MODULE = 'virtual:motif-devtools-panel';
const RESOLVED = '\0' + PANEL_MODULE;
const ENTRY = fileURLToPath(new URL('../src/panel/main.tsx', import.meta.url));

const page = (head: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Motif DevTools</title>${head}</head><body><div id="app"></div>${body}</body></html>`;

const inlineScript = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1');

export async function buildPanelHtml(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [compiler()],
    resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'], dedupe: ['@motifx/core'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      cssCodeSplit: false,
      minify: true,
      target: 'es2021',
      lib: { entry: ENTRY, formats: ['iife'], name: 'MotifDevtoolsPanel', fileName: () => 'panel.js' },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []));
  let js = '';
  let css = '';
  for (const item of outputs) {
    if (item.type === 'chunk') js += item.code;
    else if (item.fileName.endsWith('.css')) css += typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source);
  }
  return page(`<style>${css}</style>`, `<script>${inlineScript(js)}</script>`);
}

export function panelPlugin(): Plugin {
  let serving = false;
  return {
    name: 'motif-devtools-panel',
    configResolved(config) {
      serving = config.command === 'serve';
    },
    resolveId(id) {
      return id === PANEL_MODULE ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      const html = serving ? page('', `<script type="module" src="/@fs/${ENTRY.replace(/\\/g, '/').replace(/^\//, '')}"></script>`) : await buildPanelHtml();
      return `export default ${JSON.stringify(html)};`;
    },
  };
}
