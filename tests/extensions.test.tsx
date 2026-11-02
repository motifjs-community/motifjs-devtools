import { afterEach, describe, expect, it } from 'vitest';
import type { BridgeMethod } from '../src/bridge/protocol';
import type { Client, ClientEvent } from '../src/client/client';
import { DevtoolsModel, type Section } from '../src/panel/model/DevtoolsModel';
import { ExtensionsModel } from '../src/panel/model/ExtensionsModel';
import { cleanup, fakeExtensionClient, props, renderPanel, settle, text, texts, type FakeExtension, type FakePage, type Rendered } from './extension-helpers';

const HISTORY = (): FakeExtension => ({
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

type Page = FakePage;

let shown: Rendered | null = null;
let model: ExtensionsModel | null = null;

afterEach(async () => {
  await cleanup(shown);
  shown = null;
  model?.dispose();
  model = null;
});

async function render(page: Page, section = 'ext:history:list') {
  shown = await renderPanel(page, section);
  model = shown.model;
  return shown;
}

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

  it('changes the rows it holds from the events of the package and counts what the bridge dropped', async () => {
    const page: Page = {
      extensions: {
        feed: {
          sources: { rows: { key: 'id', events: { 'row:added': 'append', 'row:changed': 'upsert', 'row:gone': 'remove' }, max: 3 } },
          panels: [{ id: 'list', title: 'Feed', capabilities: { read: true, subscribe: true }, layout: { type: 'table', source: 'rows', key: 'id', columns: [{ field: 'id' }, { field: 'name' }] } }],
          read: () => [{ id: 1, name: 'one' }, { id: 2, name: 'two' }],
        },
      },
    };
    const { root, emit, reads } = await render(page, 'ext:feed:list');
    const cells = () => [...root.querySelectorAll('.dt-trow')].map((row) => [...row.querySelectorAll('.dt-tcell')].map(text).join(' '));
    expect(cells()).toEqual(['1 one', '2 two']);
    const before = reads('rows');
    emit({ type: 'ext:feed:row:changed', payload: { id: 2, name: 'two again' } });
    emit({ type: 'ext:feed:row:added', payload: { id: 3, name: 'three' } });
    emit({ type: 'ext:feed:row:added', payload: { id: 4, name: 'four' } });
    await settle();
    expect(cells()).toEqual(['2 two again', '3 three', '4 four']);
    emit({ type: 'ext:feed:row:gone', payload: { id: 3 } });
    await settle();
    expect(cells()).toEqual(['2 two again', '4 four']);
    expect(reads('rows')).toBe(before);
    emit({ type: 'devtools:ext-dropped', payload: { name: 'feed', count: 12 } });
    emit({ type: 'devtools:ext-dropped', payload: { name: 'feed', count: 3 } });
    await settle();
    expect(model!.state.extensions.find((item) => item.name === 'feed')?.dropped).toBe(15);
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
    const fake = fakeExtensionClient({ extensions: { history: HISTORY() } });
    const request = fake.client.request;
    fake.client.request = (async (method: BridgeMethod, ...args: unknown[]) => (method === 'getExtensions' ? ['history', { $motif: 'truncated', remaining: 3 }] : request(method, ...args))) as Client['request'];
    model = new ExtensionsModel(fake.client, () => '', 0);
    await model.load();
    expect(model.state.panels.map((panel) => panel.key)).toEqual(['ext:history:quiet', 'ext:history:list']);
    expect(model.state.overflow).toBe(3);
  });
});

const ACTIONS_ROWS = [
  { id: 1, name: 'cart/add', status: 'done' },
  { id: 2, name: 'orders/add', status: 'failed' },
];

const ACTIONS = (): FakeExtension => ({
  sources: { actions: { key: 'id' }, selectedAction: {} },
  commands: ['replay'],
  panels: [
    {
      id: 'actions',
      title: 'Actions',
      capabilities: { read: true, subscribe: true, write: true },
      layout: {
        type: 'stack',
        children: [
          { type: 'table', source: 'actions', key: 'id', select: 'actionId', columns: [{ field: 'name' }], open: { route: 'action', params: { id: { field: 'id' }, from: { state: 'actionId' }, how: 'row' } } },
          { type: 'button', label: 'Open', navigate: { route: 'action', params: { id: { state: 'actionId' } } } },
          { type: 'button', label: 'Nowhere', navigate: { route: 'missing' } },
        ],
      },
      routes: [
        {
          id: 'action',
          title: { field: 'name' },
          source: 'selectedAction',
          params: { id: { param: 'id' } },
          layout: {
            type: 'stack',
            children: [
              { type: 'text', title: 'Status', source: 'selectedAction', params: { id: { param: 'id' } }, field: 'status' },
              { type: 'button', label: 'Replay', command: 'replay', args: { id: { param: 'id' } } },
            ],
          },
        },
      ],
    },
  ],
  read: (_panel, source, params) => (source === 'actions' ? ACTIONS_ROWS : (ACTIONS_ROWS.find((row) => row.id === params.id) ?? null)),
  call: () => 'ok',
});

const KEY = 'ext:action-history:actions';

describe('routes of a panel', () => {
  it('opens a route from a button, shows its layout under a path back to the panel, and resolves { param } in it', async () => {
    const { root, calls } = await render({ extensions: { 'action-history': ACTIONS() } }, KEY);
    const panel = panelOf(KEY);
    model!.setValue(panel, 'actionId', 2);
    [...root.querySelectorAll<HTMLButtonElement>('.dt-w-button button')].find((button) => text(button) === 'Open')!.click();
    await settle();
    expect(panel.route).toEqual({ id: 'action', params: { id: 2 } });
    expect(texts(root, '.dt-ext-path > span')).toEqual(['Actions', '›', 'orders/add']);
    expect(root.querySelector('.dt-ext-back')).not.toBeNull();
    expect(root.querySelector('.dt-w-table')).toBeNull();
    expect(text(root.querySelector('.dt-w-text .dt-w-value'))).toBe('failed');
    root.querySelector<HTMLButtonElement>('.dt-w-button button')!.click();
    await settle();
    expect(calls.find((call) => call[0] === 'callExtension')).toEqual(['callExtension', 'action-history', 'actions', 'replay', { id: 2 }]);
    root.querySelector<HTMLButtonElement>('.dt-ext-back')!.click();
    await settle();
    expect(panel.route).toBeNull();
    expect(root.querySelector('.dt-ext-back')).toBeNull();
    expect(text(root.querySelector('.dt-ext-path'))).toBe('Actions');
    expect(root.querySelector('.dt-w-table')).not.toBeNull();
  });

  it('opens a route from a double-clicked row with the fields of that row', async () => {
    const { root } = await render({ extensions: { 'action-history': ACTIONS() } }, KEY);
    const panel = panelOf(KEY);
    root.querySelector<HTMLElement>('.dt-trow')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    expect(panel.route).toEqual({ id: 'action', params: { id: 1, how: 'row' } });
    expect(texts(root, '.dt-ext-path > span')).toEqual(['Actions', '›', 'cart/add']);
  });

  it('tells when a button points at a route the panel does not have', async () => {
    const { root } = await render({ extensions: { 'action-history': ACTIONS() } }, KEY);
    [...root.querySelectorAll<HTMLButtonElement>('.dt-w-button button')].find((button) => text(button) === 'Nowhere')!.click();
    await settle();
    expect(panelOf(KEY).route).toBeNull();
    expect(text(root.querySelector('.dt-ext-notice'))).toBe('This panel has no "missing" view');
  });

  it('closes the route when the package no longer has it', async () => {
    const page: Page = { extensions: { 'action-history': ACTIONS() } };
    const { emit } = await render(page, KEY);
    const panel = panelOf(KEY);
    model!.openRoute(panel, 'action', { id: 1 });
    (page.extensions['action-history'].panels as { routes: unknown[] }[])[0].routes = [];
    emit({ type: 'extension:changed', payload: { name: 'action-history' } });
    await settle();
    expect(panel.route).toBeNull();
    expect(panel.version).toBe(2);
  });
});

describe('reveal from the page', () => {
  type Opened = { client: Client; emit: (event: ClientEvent) => void; devtools: DevtoolsModel; gone: string[] };

  const open = async (page: Page, section: string, shown = true): Promise<Opened> => {
    const fake = fakeExtensionClient(page);
    const devtools = new DevtoolsModel(fake.client);
    devtools.state.section = section as Section;
    const gone: string[] = [];
    model = new ExtensionsModel(fake.client, () => devtools.state.section, 0, () => shown, (key) => {
      gone.push(key);
      devtools.select(key as Section);
    });
    await model.load();
    return { client: fake.client, emit: fake.emit, devtools, gone };
  };

  const target = (state: Record<string, unknown>, route?: string, params?: Record<string, unknown>) => ({ type: 'extension:reveal', payload: { name: 'action-history', target: { panel: 'actions', state, route, params } } });

  it('applies the target at once while the panel is open: the state, and the route or the panel itself', async () => {
    const { emit } = await open({ extensions: { 'action-history': ACTIONS() } }, KEY);
    const panel = panelOf(KEY);
    emit(target({ actionId: 2 }, 'action', { id: 2 }));
    await settle();
    expect(panel.values.actionId).toBe(2);
    expect(panel.route).toEqual({ id: 'action', params: { id: 2 } });
    expect(panel.pending).toBeNull();
    emit(target({ actionId: 1 }));
    await settle();
    expect(panel.values.actionId).toBe(1);
    expect(panel.route).toBeNull();
  });

  it('moves the user to the panel when the panel app is shown and nobody is typing', async () => {
    const { emit, devtools, gone } = await open({ extensions: { 'action-history': ACTIONS() } }, 'elements');
    emit(target({ actionId: 2 }));
    await settle();
    expect(gone).toEqual([KEY]);
    expect(devtools.state.section).toBe(KEY);
    expect(panelOf(KEY).values.actionId).toBe(2);
    expect(panelOf(KEY).pending).toBeNull();
  });

  it('only marks the panel while the user types, and applies the target when they open it', async () => {
    document.body.innerHTML = '<input id="busy">';
    const input = document.querySelector<HTMLInputElement>('#busy')!;
    input.focus();
    expect(document.activeElement).toBe(input);
    const { emit, devtools, gone } = await open({ extensions: { 'action-history': ACTIONS() } }, 'elements');
    const panel = panelOf(KEY);
    emit(target({ actionId: 2 }, 'action', { id: 2 }));
    await settle();
    expect(gone).toEqual([]);
    expect(panel.pending).toEqual({ panel: 'actions', state: { actionId: 2 }, route: 'action', params: { id: 2 } });
    expect(panel.values.actionId).toBeUndefined();
    devtools.select(KEY as Section);
    await settle();
    expect(panel.pending).toBeNull();
    expect(panel.values.actionId).toBe(2);
    expect(panel.route).toEqual({ id: 'action', params: { id: 2 } });
    document.body.innerHTML = '';
  });

  it('only marks the panel while the panel app is hidden', async () => {
    const { emit, gone } = await open({ extensions: { 'action-history': ACTIONS() } }, 'elements', false);
    emit(target({ actionId: 1 }));
    await settle();
    expect(gone).toEqual([]);
    expect(panelOf(KEY).pending).toMatchObject({ state: { actionId: 1 } });
  });

  it('keeps a target for a panel it has not listed yet, and ignores one that is not a target', async () => {
    const page: Page = { extensions: {} };
    const { emit, gone } = await open(page, 'elements');
    emit(target({ actionId: 1 }));
    emit({ type: 'extension:reveal', payload: { name: 'action-history', target: { route: 'action' } } });
    emit({ type: 'extension:reveal', payload: { name: 'action-history', target: 'actions' } });
    await settle();
    expect(model!.state.panels).toHaveLength(0);
    page.extensions['action-history'] = ACTIONS();
    emit({ type: 'extension:registered', payload: { name: 'action-history' } });
    await settle();
    expect(gone).toEqual([KEY]);
    expect(panelOf(KEY).values.actionId).toBe(1);
  });
});
