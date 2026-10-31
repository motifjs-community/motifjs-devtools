import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { BridgeMethod } from '../src/bridge/protocol';
import { RequestError, type Client, type ClientEvent, type ClientStatus } from '../src/client/client';
import { DevtoolsModel, type Section } from '../src/panel/model/DevtoolsModel';
import { ExtensionsModel } from '../src/panel/model/ExtensionsModel';
import { ExtensionPage } from '../src/panel/pages/ExtensionPage';
import { idleClient, tick } from './helpers';

type Fake = {
  panels?: unknown;
  sources?: Record<string, unknown>;
  commands?: string[];
  read?: (panel: string, source: string, params: Record<string, unknown>) => unknown;
  call?: (panel: string, command: string, args: Record<string, unknown>) => unknown;
  describe?: unknown;
  fail?: string;
};

type Page = { extensions: Record<string, Fake>; oldCore?: boolean };

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function fakeClient(page: Page) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: unknown[][] = [];
  const client: Client = {
    status: { connected: true, version: 2 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      calls.push([method, ...args]);
      const [name, panel, target, extra] = args as [string, string, string, Record<string, unknown>];
      const extension = page.extensions[name];
      switch (method) {
        case 'getExtensions':
          return Object.keys(page.extensions) as T;
        case 'readExtensionPanels':
          if (page.oldCore) throw new RequestError('unknown-method');
          if (extension === undefined) return { ok: false, error: 'no extension' } as T;
          if (extension.fail !== undefined) return { ok: false, error: extension.fail } as T;
          return { ok: true, value: { panels: extension.panels ?? [], sources: extension.sources ?? {}, commands: extension.commands ?? [] } } as T;
        case 'readExtensionSource':
          return (extension?.read === undefined ? { ok: false, error: 'no source' } : { ok: true, value: extension.read(panel, target, extra) }) as T;
        case 'callExtension':
          try {
            return { ok: true, value: extension?.call?.(panel, target, extra) } as T;
          } catch (error) {
            return { ok: false, error: (error as Error).message } as T;
          }
        case 'readExtension':
          return extension?.describe as T;
        default:
          return null as T;
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus(listener) {
      statuses.add(listener);
      return () => statuses.delete(listener);
    },
    onDock: () => () => {},
    ...idleClient,
    setDock() {},
    dispose() {},
  };
  const emit = (event: ClientEvent) => {
    for (const listener of listeners) listener(event);
  };
  const reads = (source: string) => calls.filter((call) => call[0] === 'readExtensionSource' && call[3] === source).length;
  const describes = () => calls.filter((call) => call[0] === 'readExtension').length;
  return { client, emit, calls, reads, describes };
}

const HISTORY = (): Fake => ({
  sources: { rows: { key: 'id', events: { 'row:added': 'refresh' } }, one: {} },
  commands: ['replay', 'explode'],
  panels: [
    {
      id: 'list',
      title: 'History',
      icon: 'timeline',
      order: 30,
      capabilities: { read: true, subscribe: true, write: true },
      layout: {
        type: 'stack',
        children: [
          { type: 'text', title: 'Title', source: 'rows', params: { id: { state: 'selected' } }, field: 'summary.title', empty: 'No title' },
          { type: 'counter', label: 'items', source: 'rows', field: 'items' },
          { type: 'toolbar', children: [{ type: 'button', label: 'Replay', command: 'replay', args: { id: 3 }, refresh: ['rows'] }, { type: 'button', label: 'Explode', command: 'explode', tone: 'danger' }] },
          { type: 'json', title: 'Items', source: 'rows', field: 'items' },
          { type: 'text', text: 'Only when shown', when: { state: 'show' } },
        ],
      },
    },
    { id: 'quiet', title: 'Quiet', order: 5, layout: { type: 'button', label: 'Nope', command: 'replay' } },
  ],
  read: (_panel, source, params) => (source === 'rows' ? { summary: { title: params.id === undefined ? 'Hello' : `Row ${params.id}` }, items: [1, 2, 3] } : null),
  call: (_panel, command) => {
    if (command === 'explode') throw new Error('boom');
    return 'ok';
  },
});

let app: Application | null = null;
let model: ExtensionsModel | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(page: Page, section = 'ext:history:list') {
  const fake = fakeClient(page);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = { connected: true, version: 2 };
  devtools.state.section = section as Section;
  model = new ExtensionsModel(fake.client, () => devtools.state.section, 0);
  await model.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(ExtensionsModel, { useValue: model });
  app = builder.build();
  app.run('#app', new ExtensionPage());
  await settle();
  return { ...fake, devtools, root: document.querySelector('.dt-extension') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const props = (root: HTMLElement) => [...root.querySelectorAll('.dt-prop-row')].map((row) => `${text(row.querySelector('.dt-prop-key'))} ${text(row.querySelector('.dt-value'))}`);
const panelOf = (key: string) => model!.state.panels.find((panel) => panel.key === key)!;

describe('extension panels', () => {
  it('lists the panels of every package by order and gives a package without panels a describe panel', async () => {
    await render({ extensions: { history: HISTORY(), sortable: { describe: { lists: 2 } } } });
    expect(model!.state.panels.map((panel) => [panel.key, panel.title, panel.order, panel.capabilities.write])).toEqual([
      ['ext:history:quiet', 'Quiet', 5, false],
      ['ext:history:list', 'History', 30, true],
      ['ext:sortable:describe', 'sortable', 100, false],
    ]);
  });

  it('shows the title, the write mark and text, counter and json widgets read from a source', async () => {
    const { root } = await render({ extensions: { history: HISTORY() } });
    expect(text(root.querySelector('h1'))).toBe('History');
    expect(root.querySelector<HTMLElement>('.dt-ext-writes')!.hidden).toBe(false);
    expect(text(root.querySelector('.dt-w-text .dt-w-value'))).toBe('Hello');
    expect(text(root.querySelector('.dt-w-count'))).toBe('3');
    expect([...root.querySelectorAll('.dt-w-json .dt-prop-key')].map(text)).toEqual(['0', '1', '2']);
  });

  it('reads a source again with the parameters that follow the panel state', async () => {
    const { root, reads, calls } = await render({ extensions: { history: HISTORY() } });
    const before = reads('rows');
    model!.setValue(panelOf('ext:history:list'), 'selected', 7);
    await settle();
    expect(text(root.querySelector('.dt-w-text .dt-w-value'))).toBe('Row 7');
    expect(reads('rows')).toBe(before + 1);
    expect(calls.at(-1)).toEqual(['readExtensionSource', 'history', 'list', 'rows', { id: 7 }]);
  });

  it('runs a command with its arguments, reads the sources it names again, and shows a failure', async () => {
    const { root, calls, reads } = await render({ extensions: { history: HISTORY() } });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.dt-w-button button')];
    const before = reads('rows');
    buttons[0].click();
    await settle();
    expect(calls.find((call) => call[0] === 'callExtension')).toEqual(['callExtension', 'history', 'list', 'replay', { id: 3 }]);
    // the three widgets read rows with the same parameters, so the panel holds one read of it
    expect(reads('rows')).toBe(before + 1);
    // a hidden element leaves the DOM and comes back with its text
    expect(root.querySelector('.dt-ext-notice')).toBeNull();
    buttons[1].click();
    await settle();
    expect(text(root.querySelector('.dt-ext-notice'))).toBe('Explode: boom');
  });

  it('keeps the commands of a panel without write disabled', async () => {
    const { root, calls } = await render({ extensions: { history: HISTORY() } }, 'ext:history:quiet');
    const button = root.querySelector<HTMLButtonElement>('.dt-w-button button')!;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('This panel may not run commands');
    button.click();
    await settle();
    expect(calls.some((call) => call[0] === 'callExtension')).toBe(false);
  });

  it('reads a source again when the package says it changed and when an event it names arrives', async () => {
    const { emit, reads } = await render({ extensions: { history: HISTORY() } });
    const before = reads('rows');
    emit({ type: 'extension:changed', payload: { name: 'history', source: 'rows' } });
    await settle();
    expect(reads('rows')).toBe(before + 1);
    emit({ type: 'ext:history:row:added', payload: { id: 9 } });
    await settle();
    expect(reads('rows')).toBe(before + 2);
    emit({ type: 'ext:history:row:ignored', payload: {} });
    await settle();
    expect(reads('rows')).toBe(before + 2);
  });

  it('shows the problem of a broken panel and a placeholder for a widget it does not know', async () => {
    const page: Page = { extensions: { odd: { panels: [{ id: 'Bad Id', title: 'Bad', layout: { type: 'text' } }, { id: 'new', title: 'New', layout: { type: 'stack', children: [{ type: 'hologram' }] } }] } } };
    const { root, devtools } = await render(page, 'ext:odd:Bad Id');
    expect(text(root.querySelector('.dt-ext-error'))).toContain('invalid id "Bad Id"');
    expect(root.querySelector('.dt-ext-body')?.children).toHaveLength(0);
    devtools.state.section = 'ext:odd:new';
    await settle();
    expect(text(root.querySelector('.dt-w-unknown'))).toContain('"hologram"');
  });

  it('shows what describe() gives on a core that has no panels yet', async () => {
    const { root } = await render({ oldCore: true, extensions: { sortable: { describe: { lists: 2, dragging: false } } } }, 'ext:sortable:describe');
    expect(text(root.querySelector('h1'))).toBe('sortable');
    expect([...root.querySelectorAll('.dt-prop-key')].map(text)).toEqual(['lists', 'dragging']);
    expect(text(root.querySelector('.dt-ext-error'))).toBe('');
  });

  it('reads describe() again on an event of the package and on a reactivity flush, not on events of others', async () => {
    const page: Page = { extensions: { toasts: { describe: { visible: 0, shown: 0 } }, history: HISTORY() } };
    const { root, emit, describes } = await render(page, 'ext:toasts:describe');
    expect(props(root)).toEqual(['visible 0', 'shown 0']);
    const before = describes();
    page.extensions.toasts.describe = { visible: 1, shown: 1 };
    emit({ type: 'ext:toasts:shown', payload: { id: 1 } });
    await settle();
    expect(describes()).toBe(before + 1);
    expect(props(root)).toEqual(['visible 1', 'shown 1']);
    emit({ type: 'reactivity:flush', payload: { id: 9, duration: 1, runs: 1, triggers: [], effects: [], operations: [] } });
    await settle();
    expect(describes()).toBe(before + 2);
    emit({ type: 'ext:history:row:added', payload: {} });
    await settle();
    expect(describes()).toBe(before + 2);
  });

  it('tells when the metadata was refused by the bridge', async () => {
    const { root } = await render({ extensions: { fat: { fail: 'panels-too-large' } } }, 'ext:fat:describe');
    expect(text(root.querySelector('.dt-ext-error'))).toContain('over the limit');
  });

  it('builds the widgets again when the layout changes', async () => {
    const page: Page = { extensions: { history: HISTORY() } };
    const { root, emit } = await render(page);
    const panel = panelOf('ext:history:list');
    (page.extensions.history.panels as { layout: unknown }[])[0].layout = { type: 'text', text: 'Rebuilt' };
    emit({ type: 'extension:changed', payload: { name: 'history' } });
    await settle();
    expect(panel.version).toBe(2);
    expect(text(root.querySelector('.dt-ext-body'))).toBe('Rebuilt');
  });

  it('hides a widget until the state it waits for is on', async () => {
    const { root } = await render({ extensions: { history: HISTORY() } });
    const hidden = [...root.querySelectorAll('.dt-w-text')].at(-1)!;
    expect(hidden.classList.contains('dt-w-hidden')).toBe(true);
    model!.setValue(panelOf('ext:history:list'), 'show', true);
    await settle();
    expect(hidden.classList.contains('dt-w-hidden')).toBe(false);
  });

  it('counts the packages the bridge left out of the list', async () => {
    const fake = fakeClient({ extensions: { history: HISTORY() } });
    const request = fake.client.request;
    fake.client.request = (async (method: BridgeMethod, ...args: unknown[]) => (method === 'getExtensions' ? ['history', { $motif: 'truncated', remaining: 3 }] : request(method, ...args))) as Client['request'];
    model = new ExtensionsModel(fake.client, () => '', 0);
    await model.load();
    expect(model.state.panels.map((panel) => panel.key)).toEqual(['ext:history:quiet', 'ext:history:list']);
    expect(model.state.overflow).toBe(3);
  });
});
