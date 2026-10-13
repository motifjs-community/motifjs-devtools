import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { ElementsPage } from '../src/panel/pages/ElementsPage';
import { toTransfer } from '../src/bridge/serialize';
import { tick } from './helpers';

const node = (path: number[], type: string, tag: string, children: unknown[] = [], extra = {}) => ({
  path, type, tag, built: true, visible: true, waiting: false, disposed: false, connected: true, childCount: children.length, children, ...extra,
});

const TREE = node([], 'Component', 'div', [
  node([0], 'AppShell', 'div', [
    node([0, 0], 'Component', 'header', [node([0, 0, 0], 'UserMenu', 'button', [], { waiting: true, connected: false, visible: false })]),
    node([0, 1], 'StatCard', 'article', [node([0, 1, 0], 'Component', '#text')]),
  ]),
]);

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

function fakeClient() {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      calls.push({ method, args });
      if (method === 'getTree') return TREE as T;
      if (method === 'inspect') return toTransfer({ ...INSPECTION, bindings: [...INSPECTION.bindings, { kind: 'list', property: undefined, member: undefined, active: null }] }, 6) as T;
      if (method === 'getCounters') return { components: { live: 0, inTree: 0, notInTree: 0, byType: {} }, bindings: 0, listeners: { dom: 0, component: 0 }, effects: { live: 0, owned: 0 }, reactivity: { runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 } } as T;
      if (method === 'setClass' || method === 'setVisible') return { ok: true } as T;
      if (method === 'readValue' && JSON.stringify(args[2]) === '["broken"]') return { ok: false, error: 'getter' } as T;
      if (method === 'readValue') return { ok: true, value: { entries: [{ key: 'id', value: 7 }, { key: 'meta', value: { kind: 'object', type: 'Object', keys: 1 } }], total: 5 } } as T;
      return [] as T;
    },
    onEvent: (_listener: (event: ClientEvent) => void) => () => {},
    onStatus: () => () => {},
    onDock: () => () => {},
    setDock() {},
    dispose() {},
  };
  return { client, calls };
}

let app: Application | null = null;

afterEach(async () => {
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render() {
  const { client, calls } = fakeClient();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: new DevtoolsModel(client) });
  app = builder.build();
  const page = new ElementsPage();
  app.run('#app', page);
  for (let i = 0; i < 4; i++) await tick();
  return { page, calls, root: document.querySelector('.dt-elements') as HTMLElement };
}

const rowTexts = (root: HTMLElement) => [...root.querySelectorAll('.dt-row')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

describe('ElementsPage', () => {
  it('lists every component with names and tags', async () => {
    const { root } = await render();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', '<header>', 'UserMenu<button>WAITING', 'StatCard<article>', '<#text>']);
    expect(root.querySelector('.dt-tree-foot')?.textContent).toContain('5 connected');
  });

  it('hides plain elements on request and keeps named descendants', async () => {
    const { page, root } = await render();
    page.model.setHidePlain(true);
    await tick();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>', 'UserMenu<button>WAITING', 'StatCard<article>']);
    expect(page.model.state.rows.find((row) => row.type === 'StatCard')?.hasChildren).toBe(false);
  });

  it('filters by name or tag', async () => {
    const { page, root } = await render();
    page.model.setQuery('stat');
    await tick();
    expect(rowTexts(root)).toEqual(['StatCard<article>']);
  });

  it('collapses a row', async () => {
    const { page, root } = await render();
    page.model.toggle(page.model.state.rows[1]);
    await tick();
    expect(rowTexts(root)).toEqual(['<div>', 'AppShell<div>']);
  });

  it('inspects the selected component', async () => {
    const errors = vi.spyOn(console, 'error');
    const { page, root, calls } = await render();
    page.model.select(page.model.state.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    expect(calls.some((c) => c.method === 'inspect' && JSON.stringify(c.args) === '[[0,1]]')).toBe(true);
    const inspector = root.querySelector('.dt-inspector') as HTMLElement;
    expect(inspector.querySelector('.dt-inspect-title')?.textContent).toContain('StatCard');
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
    page.model.hover(page.model.state.rows[4]);
    page.model.hover(null);
    const highlights = calls.filter((c) => c.method === 'highlight');
    expect(highlights.map((c) => c.args)).toEqual([[[0, 1]], [null]]);
    expect(() => structuredClone(highlights.map((c) => c.args))).not.toThrow();
  });

  it('expands a prop value one level through readValue and collapses it', async () => {
    const { page, root, calls } = await render();
    page.model.select(page.model.state.rows[4]);
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
    page.model.select(page.model.state.rows[4]);
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
    page.model.select(page.model.state.rows[4]);
    for (let i = 0; i < 4; i++) await tick();
    await page.model.toggleValue(['broken']);
    await tick();
    expect(root.querySelector('.dt-more.dt-error')?.textContent).toBe('getter');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('removes a class through the contract', async () => {
    const { page, calls } = await render();
    page.model.select(page.model.state.rows[4]);
    await tick();
    await page.model.setClass('positive', false);
    expect(calls.find((c) => c.method === 'setClass')?.args).toEqual([[0, 1], 'positive', false]);
  });
});
