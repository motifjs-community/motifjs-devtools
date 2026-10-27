import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { MAX_FLUSHES, ReactivityModel } from '../src/panel/model/ReactivityModel';
import { ReactivityPage } from '../src/panel/pages/ReactivityPage';
import { StoresModel } from '../src/panel/model/StoresModel';
import { idleClient, tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 4; i++) await tick();
};

const COUNTERS = {
  components: { live: 10, inTree: 9, notInTree: 1, byType: {} },
  bindings: 4,
  listeners: { dom: 1, component: 0 },
  effects: { live: 48, owned: 45 },
  reactivity: { runs: 1284, flushes: 342, flushRuns: 1265, lastFlushDuration: 0.84, maxFlushDuration: 4.21 },
};

function fakeClient() {
  const listeners = new Set<(event: ClientEvent) => void>();
  const server = { stores: [] as unknown[] };
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string) {
      if (method === 'getCounters') return COUNTERS as T;
      if (method === 'getStores') return server.stores as T;
      return [] as T;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus: () => () => {},
    onDock: () => () => {},
    ...idleClient,
    setDock() {},
    dispose() {},
  };
  const emit = (event: ClientEvent) => {
    for (const listener of listeners) listener(event);
  };
  return { client, emit, server };
}

const flush = (duration: number, runs: number, extra = {}) => ({
  type: 'reactivity:flush',
  payload: {
    duration,
    runs,
    triggers: [{ target: { kind: 'object', type: 'Cart', keys: 2 }, key: 'total', count: 2 }],
    effects: [
      { path: [0, 1], type: 'StatCard', tag: 'article', kind: 'class', runs: 1 },
      { path: null, type: null, tag: null, kind: 'computed', runs: 1 },
    ],
    ...extra,
  },
});

let app: Application | null = null;
let model: ReactivityModel | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(time = () => 1_000_000) {
  const { client, emit, server } = fakeClient();
  const devtools = new DevtoolsModel(client);
  devtools.state.status = { connected: true, version: 1 };
  model = new ReactivityModel(client, time);
  const stores = new StoresModel(client, () => false);
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(ReactivityModel, { useValue: model });
  builder.services.addSingleton(StoresModel, { useValue: stores });
  app = builder.build();
  app.run('#app', new ReactivityPage());
  await devtools.refresh();
  await tick();
  return { emit, devtools, stores, server, root: document.querySelector('.dt-profile') as HTMLElement };
}

const rows = (root: HTMLElement) => [...root.querySelectorAll('.dt-flush .dt-flush-row')];

describe('Reactivity', () => {
  it('shows the counters from the contract', async () => {
    const { root } = await render();
    const cards = [...root.querySelectorAll('.dt-card')].map((card) => card.textContent?.replace(/\s+/g, ' ').trim());
    expect(cards).toEqual([
      'TOTAL RUNS1,284+0 in last minute',
      'FLUSHES3423.7 effects / flush',
      'LAST FLUSH0.84 ms Max 4.21 ms'.replace(' Max', 'Max'),
      'LIVE EFFECTS4845 component-owned',
    ]);
  });

  it('records flushes newest first with an activity bar relative to the slowest', async () => {
    const { emit, root } = await render();
    emit(flush(1, 3));
    emit(flush(2, 5));
    await tick();
    const list = rows(root);
    expect(list).toHaveLength(2);
    expect(list[0].textContent).toContain('2.00 ms');
    expect((list[0].querySelector('.dt-bar i') as HTMLElement).style.width).toBe('100%');
    expect((list[1].querySelector('.dt-bar i') as HTMLElement).style.width).toBe('50%');
    expect(root.querySelector('.dt-card')?.textContent).toContain('+8 in last minute');
  });

  it('pauses, resumes and clears the timeline', async () => {
    const { emit, root } = await render();
    model!.togglePause();
    emit(flush(1, 1));
    await settle();
    expect(rows(root)).toHaveLength(0);
    expect(root.querySelector('.dt-live')?.textContent).toBe('PAUSED');
    model!.togglePause();
    emit(flush(1, 1));
    await tick();
    expect(rows(root)).toHaveLength(1);
    model!.clear();
    await tick();
    expect(rows(root)).toHaveLength(0);
  });

  it('keeps at most the last MAX_FLUSHES flushes', async () => {
    const { emit } = await render();
    for (let i = 0; i < MAX_FLUSHES + 5; i++) emit(flush(1, 1));
    expect(model!.state.flushes).toHaveLength(MAX_FLUSHES);
  });

  it('opens a flush and jumps from an effect to Elements', async () => {
    const { emit, root, devtools } = await render();
    emit(flush(1, 2));
    await tick();
    (rows(root)[0] as HTMLButtonElement).click();
    await settle();
    const detail = root.querySelector('.dt-flush-detail') as HTMLElement;
    expect(detail.textContent).toContain('Cart.total');
    expect(detail.textContent).toContain('StatCard');
    const revealed: number[][] = [];
    devtools.onReveal((path) => revealed.push(path));
    const links = [...detail.querySelectorAll('.dt-link')] as HTMLButtonElement[];
    expect(links[1].disabled).toBe(true);
    links[0].click();
    expect(revealed).toEqual([[0, 1]]);
    expect(devtools.state.section).toBe('elements');
  });

  it('names the store and path of a trigger', async () => {
    const { emit, root, stores, server } = await render();
    server.stores = [{ id: 2, name: 'Cart', type: 'reactive', value: {}, holders: [{ kind: 'component', path: [0], type: 'CartView', field: 'cart' }] }];
    await stores.load();
    const target = { kind: 'object', type: 'Cart', keys: 2 };
    emit(flush(1, 1, { triggers: [{ target, key: 'name', count: 1, store: { id: 2, path: ['user'] } }, { target, key: 'n', count: 1, store: { id: 9, path: [] } }] }));
    await tick();
    (rows(root)[0] as HTMLButtonElement).click();
    await settle();
    const detail = root.querySelector('.dt-flush-detail') as HTMLElement;
    expect(detail.textContent).toContain('CartView.cart.user.name');
    expect(detail.textContent).toContain('store#9.n');
  });

  it('counts runs of the last minute only', async () => {
    let now = 0;
    const { emit } = await render(() => now);
    emit(flush(1, 4));
    now = 70_000;
    emit(flush(1, 1));
    expect(model!.lastMinuteRuns).toBe(1);
  });
});
