import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus, Stream } from '../src/client/client';
import { TREE_FLAGS, type TreeRecord } from '../src/bridge/protocol';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { ElementsPage } from '../src/panel/pages/ElementsPage';
import { toTransfer } from '../src/bridge/serialize';
import { drain, tick } from './helpers';

const node = (path: number[], type: string, tag: string, children: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  path, type, tag, built: true, visible: true, waiting: false, disposed: false, connected: true, document: 0, childCount: children.length, children, ...extra,
});

const TREE = node([], 'Component', 'div', [
  node([0], 'AppShell', 'div', [
    node([0, 0], 'Component', 'header', [node([0, 0, 0], 'UserMenu', 'button', [], { waiting: true, connected: false, visible: false })]),
    node([0, 1], 'StatCard', 'article', [node([0, 1, 0], 'Component', '#text')]),
  ]),
]);

type TestNode = ReturnType<typeof node>;

const recordsOf = (tree: TestNode): TreeRecord[] => {
  const out: TreeRecord[] = [];
  const walk = (n: TestNode) => {
    const flags = (n.built ? TREE_FLAGS.built : 0) | (n.visible ? TREE_FLAGS.visible : 0) | (n.waiting ? TREE_FLAGS.waiting : 0) | (n.disposed ? TREE_FLAGS.disposed : 0) | (n.connected ? TREE_FLAGS.connected : 0);
    const record: TreeRecord = [n.path.length, n.path.at(-1) ?? 0, n.type, n.tag, flags, n.children.length, (n as { document?: number }).document ?? 0];
    const title = (n as { title?: unknown }).title;
    if (typeof title === 'string') record.push(title);
    out.push(record);
    for (const child of n.children as TestNode[]) walk(child);
  };
  walk(tree);
  return out;
};

const INSPECTION = {
  ...node([0, 1], 'StatCard', 'article'),
  props: { class: 'root-only' },
  fields: { state: { kind: 'object', type: 'Object', keys: 2 }, title: 'Orders' },
  functionProps: { indexkey: { kind: 'function', name: 'indexkey' }, runover: { kind: 'object', type: 'Object', keys: 0 }, childs: { kind: 'array', length: 0 }, title: 'Total revenue', trend: 12.5, broken: { kind: 'object', type: 'Object', keys: 1 }, stat: { kind: 'object', type: 'Object', keys: 5 }, format: { kind: 'function', name: 'formatCurrency' } },
  bindings: [{ kind: 'property', property: 'textContent', active: true }, { kind: 'class', active: false }],
  events: [{ name: 'click', dom: true, handler: { kind: 'function', name: 'onClick' } }],
  hooks: [{ name: 'onBuilt', method: true, handlers: 1 }],
  classes: { static: ['card'], reactive: [{ id: '1', classes: ['positive'] }] },
  attributes: [{ name: 'title' }],
  services: { scope: { kind: 'root', name: null }, requested: ['Api'] },
  effects: [{ kind: 'class', runs: 3, lastDuration: 0.12, lastTrigger: null, deps: [] }],
  extensions: {},
};

function fakeClient(tree: TestNode = TREE) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      calls.push({ method, args });
      if (method === 'inspect' && JSON.stringify(args[0]) === '[1]') return toTransfer({ ...INSPECTION, path: [1], type: 'Window', tag: 'body', functionProps: undefined, window: { kind: 'popup', title: 'Notlar', open: true, components: 1 } }, 6) as T;
      if (method === 'inspect') return toTransfer({ ...INSPECTION, bindings: [...INSPECTION.bindings, { kind: 'list', property: undefined, member: undefined, active: null }] }, 6) as T;
      if (method === 'getCounters') return { components: { live: 0, inTree: 0, notInTree: 0, byType: {} }, bindings: 0, listeners: { dom: 0, component: 0 }, effects: { live: 0, owned: 0 }, reactivity: { runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 } } as T;
      if (method === 'setClass' || method === 'setVisible') return { ok: true } as T;
      if (method === 'readValue' && JSON.stringify(args[2]) === '["broken"]') return { ok: false, error: 'getter' } as T;
      if (method === 'readValue') return { ok: true, value: { entries: [{ key: 'id', value: 7 }, { key: 'meta', value: { kind: 'object', type: 'Object', keys: 1 } }], total: 5 } } as T;
      if (method === 'getDocuments') return (tree === TREE ? [DOCUMENTS[0]] : DOCUMENTS) as T;
      return [] as T;
    },
    shown: true,
    stream<C, T>(method: string, onChunk: (chunk: C) => void): Stream<T> {
      calls.push({ method, args: [] });
      if (method !== 'readTree') return { done: new Promise<T>(() => {}), cancel() {} };
      const records = recordsOf(tree);
      onChunk(records as C);
      return { done: Promise.resolve({ count: records.length } as T), cancel() {} };
    },
    onEvent: (_listener: (event: ClientEvent) => void) => () => {},
    onStatus: () => () => {},
    onDock: () => () => {},
    onShown: () => () => {},
    setDock() {},
    dispose() {},
  };
  return { client, calls };
}

const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let app: Application | null = null;

afterEach(async () => {
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
  if (clientHeight !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
});

async function render(tree?: TestNode) {
  const { client, calls } = fakeClient(tree);
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  const devtools = new DevtoolsModel(client);
  devtools.select('elements');
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  app = builder.build();
  const page = new ElementsPage();
  app.run('#app', page);
  for (let i = 0; i < 8; i++) await tick();
  return { page, calls, root: document.querySelector('.dt-elements') as HTMLElement };
}

const rowTexts = (root: HTMLElement) => [...root.querySelectorAll('.dt-row')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

const DOCUMENTS = [
  { index: 0, title: 'Motif Shop', name: '', url: 'http://localhost/', kind: 'page' },
  { index: 1, title: 'Notlar', name: 'notes', url: 'http://localhost/notes', kind: 'window' },
  { index: 2, title: '', name: 'Order preview', url: 'about:srcdoc', kind: 'frame', frame: [0, 0, 1] },
  { index: 3, title: '', name: '', url: 'about:blank', kind: 'frame' },
];

const FRAMED = node([], 'Application', '#roots', [
  node([0], 'Component', 'div', [node([0, 0], 'AppShell', 'div', [node([0, 0, 0], 'Preview', 'figure', [node([0, 0, 0, 0], 'Component', 'strong', [], { document: 2 })], { document: 2 }), node([0, 0, 1], 'Component', 'iframe')])]),
]);

const FOREST = node([], 'Application', '#roots', [
  node([0], 'Component', 'div', [node([0, 0], 'AppShell', 'div', [node([0, 0, 0], 'StatCard', 'article', [], { document: 1 })])]),
  node([1], 'Window', 'body', [node([1, 0], 'NoteEditor', 'section', [], { document: 1 })], { document: 1, title: 'Notlar' }),
]);

describe('ElementsPage', () => {
  it('lists the shell and each window as top rows and leaves the root list itself out', async () => {
    const { page, root } = await render(FOREST);
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'StatCard<article>Notlar', 'Window<body>Notlar1 hosted', 'NoteEditor<section>', 'StatCard<article>page tree']);
    expect(page.model.rows.map((row) => row.depth)).toEqual([0, 1, 2, 0, 1, 1]);
    expect(page.model.rows.map((row) => row.away)).toEqual([null, null, 'Notlar', null, null, null]);
    expect(page.model.rows.map((row) => row.mirror)).toEqual([false, false, false, false, false, true]);
    expect(page.model.rows[3]).toMatchObject({ title: 'Notlar', hosted: 1 });
    expect(page.model.rows[5]).toMatchObject({ path: [0, 0, 0], key: '1>0.0.0' });
    expect(root.querySelector('.dt-tree-head')?.textContent).toContain('5 / 5 NODES');
    page.model.setHidePlain(true);
    await drain();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'StatCard<article>Notlar', 'Window<body>Notlar1 hosted', 'NoteEditor<section>', 'StatCard<article>page tree']);
  });

  it('lists the documents of the app and names a row\'s document from that list when no window root carries it', async () => {
    const { page, root } = await render(FRAMED);
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'Preview<figure>Order preview', '<strong>', '<iframe>Order preview2 hosted', 'Preview<figure>page tree', '<strong>']);
    expect(page.model.rows.map((row) => row.depth)).toEqual([0, 1, 2, 3, 2, 3, 4]);
    expect(page.model.rows.map((row) => row.away)).toEqual([null, null, 'Order preview', null, null, null, null]);
    expect(page.model.rows.map((row) => row.entry)).toEqual([false, false, true, false, false, true, false]);
    expect(page.model.rows[4]).toMatchObject({ title: 'Order preview', hosted: 2, mirror: false });
    expect(page.model.rows[5]).toMatchObject({ path: [0, 0, 0], key: '0.0.1>0.0.0', mirror: true });
    page.model.setQuery('order');
    await drain();
    expect(rowTexts(root)).toEqual(['Preview<figure>Order preview', '<strong>', '<iframe>Order preview2 hosted']);
    page.model.setQuery('strong');
    await drain();
    expect(rowTexts(root)).toEqual(['<strong>Order preview', '<strong>']);
    const docs = root.querySelector('.dt-tree-docs') as HTMLElement;
    expect([...docs.querySelectorAll('span')].map((span) => span.textContent)).toEqual(['DOCUMENTS', 'page · Notlar (window) · Order preview (iframe) · iframe']);
  });

  it('leaves the document list out while the app has only its page', async () => {
    const { root } = await render();
    expect(root.querySelector('.dt-tree-docs')).toBeNull();
  });

  it('finds the rows that live in a window by the window title', async () => {
    const { page, root } = await render(FOREST);
    page.model.setQuery('notlar');
    await drain();
    expect(rowTexts(root)).toEqual(['StatCard<article>Notlar', 'Window<body>Notlar1 hosted']);
  });

  it('walks a window\'s hosted tree under the window row and keeps the rows bound to the real component', async () => {
    const { page, root, calls } = await render(FOREST);
    page.model.select(page.model.rows[5]);
    for (let i = 0; i < 4; i++) await tick();
    expect(calls.some((c) => c.method === 'inspect' && JSON.stringify(c.args) === '[[0,0,0]]')).toBe(true);
    page.model.hover(page.model.rows[5]);
    expect(calls.at(-1)).toEqual({ method: 'highlight', args: [[0, 0, 0]] });
    page.model.toggle(page.model.rows[3]);
    await drain();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'StatCard<article>Notlar', 'Window<body>Notlar1 hosted']);
    expect(root.querySelector('.dt-tree-head')?.textContent).toContain('4 / 5 NODES');
  });

  it('shows what a window root is when it is selected', async () => {
    const { page, root } = await render(FOREST);
    page.model.select(page.model.rows[3]);
    for (let i = 0; i < 4; i++) await tick();
    const inspector = root.querySelector('.dt-inspector') as HTMLElement;
    expect(inspector.querySelector('.dt-inspect-title')?.textContent).toContain('Window');
    const section = [...inspector.querySelectorAll('details')].find((d) => d.querySelector('summary')?.textContent?.includes('Window')) as HTMLElement;
    expect(section.textContent).toContain('popup');
    expect(section.textContent).toContain('Notlar');
    expect(section.textContent).toContain('open');
    expect(inspector.querySelector('[aria-label="Toggle visibility"]')).toBeNull();
  });

  it('lists every component with names and tags', async () => {
    const { root } = await render();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', '<header>', 'UserMenu<button>WAITING', 'StatCard<article>', '<#text>']);
    expect(root.querySelector('.dt-tree-foot')?.textContent).toContain('5 connected');
  });

  it('hides plain elements on request and keeps named descendants', async () => {
    const { page, root } = await render();
    page.model.setHidePlain(true);
    await drain();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'UserMenu<button>WAITING', 'StatCard<article>']);
    expect(page.model.rows.find((row) => row.type === 'StatCard')?.hasChildren).toBe(false);
  });

  it('filters by name or tag', async () => {
    const { page, root } = await render();
    page.model.setQuery('stat');
    await drain();
    expect(rowTexts(root)).toEqual(['StatCard<article>']);
  });

  it('collapses a row', async () => {
    const { page, root } = await render();
    page.model.toggle(page.model.rows[1]);
    await drain();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>']);
  });

  it('inspects the selected component', async () => {
    const errors = vi.spyOn(console, 'error');
    const { page, root, calls } = await render();
    page.model.select(page.model.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    expect(calls.some((c) => c.method === 'inspect' && JSON.stringify(c.args) === '[[0,1]]')).toBe(true);
    const inspector = root.querySelector('.dt-inspector') as HTMLElement;
    expect(inspector.querySelector('.dt-inspect-title')?.textContent).toContain('StatCard');
    expect(inspector.querySelector('[aria-label="Toggle visibility"]')).not.toBeNull();
    expect(inspector.querySelector('.dt-kv')?.textContent).toContain('"Total revenue"');
    expect(inspector.querySelector('.dt-kv')?.textContent).toContain('ƒ formatCurrency()');
    expect(inspector.querySelector('.dt-kv')?.textContent).not.toContain('runover');
    expect([...inspector.querySelectorAll('.dt-chip.removable')].map((c) => c.textContent)).toEqual(['card', 'positive']);
    expect(inspector.querySelectorAll('.dt-list')[0].querySelectorAll('li')).toHaveLength(3);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('sends a plain path that postMessage can copy when a row is hovered', async () => {
    const { page, calls } = await render();
    page.model.hover(page.model.rows[4]);
    page.model.hover(null);
    const highlights = calls.filter((c) => c.method === 'highlight');
    expect(highlights.map((c) => c.args)).toEqual([[[0, 1]], [null]]);
    expect(() => structuredClone(highlights.map((c) => c.args))).not.toThrow();
  });

  it('expands a prop value one level through readValue and collapses it', async () => {
    const { page, root, calls } = await render();
    page.model.select(page.model.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    const statRow = [...root.querySelectorAll('.dt-prop-row')].find((row) => row.textContent?.includes('stat')) as HTMLElement;
    (statRow.querySelector('.dt-caret') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) await tick();
    expect(calls.find((c) => c.method === 'readValue')?.args).toEqual([[0, 1], 'functionProps', ['stat']]);
    const text = root.querySelector('.dt-kv')?.textContent ?? '';
    expect(text).toContain('id');
    expect(text).toContain('… 3 more');
    await page.model.toggleValue(['stat']);
    await tick();
    expect(page.model.state.values).toEqual({});
  });

  it('lists the fields of a component and opens them through readValue with the fields source', async () => {
    const { page, root, calls } = await render();
    page.model.select(page.model.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    const fields = root.querySelector('.dt-fields') as HTMLElement;
    expect(fields.textContent).toContain('title');
    expect(fields.textContent).toContain('"Orders"');
    const stateRow = [...fields.querySelectorAll('.dt-prop-row')].find((row) => row.textContent?.includes('state')) as HTMLElement;
    (stateRow.querySelector('.dt-caret') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) await tick();
    expect(calls.find((c) => c.method === 'readValue')?.args).toEqual([[0, 1], 'fields', ['state']]);
    expect(fields.textContent).toContain('id');
    expect(root.querySelector('.dt-kv')?.textContent).not.toContain('… 3 more');
  });

  it('shows the error when a value cannot be read', async () => {
    const errors = vi.spyOn(console, 'error');
    const { page, root } = await render();
    page.model.select(page.model.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    await page.model.toggleValue(['broken']);
    await tick();
    expect(root.querySelector('.dt-more.dt-error')?.textContent).toBe('getter');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('removes a class through the contract', async () => {
    const { page, calls } = await render();
    page.model.select(page.model.rows[4]);
    await tick();
    await page.model.setClass('positive', false);
    expect(calls.find((c) => c.method === 'setClass')?.args).toEqual([[0, 1], 'positive', false]);
  });
});

describe('ElementsPage with a large tree', () => {
  const ROWS = 12_000;
  const large = () => node([], 'Component', 'div', [node([0], 'List', '#fragment', Array.from({ length: ROWS }, (_, i) => node([0, i], 'Row', 'li')))]);

  const settle = async () => {
    for (let i = 0; i < 40; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('computes every row but renders only the rows around the viewport', async () => {
    const { page, root } = await render(large());
    await settle();
    expect(page.model.state.total).toBe(ROWS + 2);
    expect(page.model.state.rowCount).toBe(ROWS + 2);
    expect(page.model.rows).toHaveLength(ROWS + 2);
    const rendered = root.querySelectorAll('.dt-row').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(Math.ceil((600 / 28) * 3));
    expect(root.querySelector('.dt-tree-head')?.textContent).toContain(`${ROWS + 2} / ${ROWS + 2} NODES`);
  });

  it('keeps the result of the newest request when the rows are asked for again while computing', async () => {
    const { page } = await render(large());
    await settle();
    page.model.setQuery('row');
    page.model.setQuery('list');
    await settle();
    expect(page.model.rows.map((row) => row.type)).toEqual(['List']);
    expect(page.model.state.rowCount).toBe(1);
  });
});

describe('ElementsModel', () => {
  it('runs one tree read at a time and reads once more after changes during a read', async () => {
    const { ElementsModel } = await import('../src/panel/model/ElementsModel');
    const eventListeners = new Set<(event: ClientEvent) => void>();
    const finishes: (() => void)[] = [];
    let reads = 0;
    const client: Client = {
      status: { connected: true, version: 1 },
      dock: null,
      shown: true,
      request: <T,>() => Promise.resolve(null as T),
      stream<C, T>(method: string, onChunk: (chunk: C) => void): Stream<T> {
        if (method !== 'readTree') return { done: new Promise<T>(() => {}), cancel() {} };
        reads++;
        return {
          done: new Promise<T>((resolve) => {
            finishes.push(() => {
              onChunk([[0, 0, 'App', 'div', TREE_FLAGS.built | TREE_FLAGS.connected, 0]] as C);
              resolve({ count: 1 } as T);
            });
          }),
          cancel() {},
        };
      },
      onEvent(listener) {
        eventListeners.add(listener);
        return () => eventListeners.delete(listener);
      },
      onStatus: () => () => {},
      onDock: () => () => {},
      onShown: () => () => {},
      setDock() {},
      dispose() {},
    };
    const model = new ElementsModel(client, () => true, 0);
    expect(reads).toBe(1);
    for (const listener of eventListeners) listener({ type: 'tree:changed', payload: { parents: [[]] } });
    for (const listener of eventListeners) listener({ type: 'component:built', payload: { path: [0] } });
    for (let i = 0; i < 4; i++) await tick();
    expect(reads).toBe(1);
    finishes.shift()!();
    for (let i = 0; i < 8; i++) await tick();
    expect(reads).toBe(2);
    finishes.shift()!();
    for (let i = 0; i < 8; i++) await tick();
    expect(reads).toBe(2);
    expect(model.state.total).toBe(1);
    model.dispose();
  });
});
