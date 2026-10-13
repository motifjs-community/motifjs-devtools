import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { StoresModel, displayName } from '../src/panel/model/StoresModel';
import { StoresPage } from '../src/panel/pages/StoresPage';
import { tick } from './helpers';
import { formatClock } from '../src/panel/format';

const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

type Call = { method: string; args: unknown[] };

const STORES = (): Record<string, unknown>[] => [
  { id: 1, name: 'reactive', type: 'reactive', value: { orders: { $motif: 'array', length: 2 }, signedIn: false }, holders: [] },
  { id: 2, name: 'Cart', type: 'reactive', value: { items: [], total: 4 }, holders: [{ kind: 'component', path: [0, 2], type: 'CartView', field: 'cart' }] },
  { id: 3, name: 'signal', type: 'signal', value: 'dark', holders: [{ kind: 'service', token: 'ThemeService', lifetime: 'singleton', field: 'theme' }] },
  { id: 4, name: 'computed', type: 'computed', value: 24780, stale: true, holders: [] },
];

function fakeClient(stores = STORES()) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: Call[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      calls.push({ method, args });
      if (method === 'getStores') return stores.map((s) => ({ ...s })) as T;
      if (method === 'readStore') {
        const [id, keys] = args as [number, string[]];
        if (id === 2 && keys.length === 0) return { ok: true, value: { value: { kind: 'object', type: 'Cart', keys: 2 }, entries: [{ key: 'items', value: { kind: 'array', length: 0 } }, { key: 'total', value: 4 }], total: 2 } } as T;
        if (id === 3) return { ok: true, value: { value: 'dark', entries: [], total: 0 } } as T;
        return { ok: true, value: { value: null, entries: [], total: 0 } } as T;
      }
      if (method === 'setStoreValue') return { ok: true } as T;
      if (method === 'getCounters') return null as T;
      return [] as T;
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
    setDock() {},
    dispose() {},
  };
  const emit = (event: ClientEvent) => {
    for (const listener of listeners) listener(event);
  };
  const connect = () => {
    for (const listener of statuses) listener({ connected: true, version: 1 });
  };
  return { client, emit, connect, calls, stores };
}

let app: Application | null = null;
let model: StoresModel | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(stores = STORES()) {
  const fake = fakeClient(stores);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = { connected: true, version: 1 };
  model = new StoresModel(fake.client, () => true, 0, () => Date.UTC(2026, 9, 13, 9, 30, 0, 0));
  await model.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(StoresModel, { useValue: model });
  app = builder.build();
  app.run('#app', new StoresPage());
  await settle();
  return { ...fake, devtools, root: document.querySelector('.dt-stores') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const rows = (root: HTMLElement) => [...root.querySelectorAll('.dt-store-entry')];
const cells = (row: Element) => [...row.querySelectorAll('.dt-store-row > span')].map(text).filter(Boolean).join(' | ');
const open = async (root: HTMLElement, index: number) => {
  (rows(root)[index].querySelector('.dt-store-row') as HTMLButtonElement).click();
  await settle();
  return rows(root)[index].querySelector('.dt-store-detail') as HTMLElement;
};

describe('Stores', () => {
  it('names stores after the field that keeps them', () => {
    const [module, cart, theme] = STORES();
    expect(displayName(module as never)).toBe('reactive');
    expect(displayName(cart as never)).toBe('CartView.cart');
    expect(displayName(theme as never)).toBe('ThemeService.theme');
  });

  it('lists the stores with their type and a short value', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.dt-store-total'))).toBe('4');
    expect(rows(root).map(cells)).toEqual([
      '01 | reactive#1 | reactive | 2 keys',
      '02 | CartView.cart#2 | reactive | 2 keys',
      '03 | ThemeService.theme#3 | signal | "dark"',
      '04 | computed#4 | computed | 24780 | stale',
    ]);
  });

  it('filters by type', async () => {
    const { root } = await render();
    model!.setFilter('signal');
    await settle();
    expect(rows(root).map((row) => text(row.querySelector('.dt-store-name')))).toEqual(['ThemeService.theme#3']);
  });

  it('opens a store to show who keeps it and its value one level deep', async () => {
    const { root, calls, devtools } = await render();
    const detail = await open(root, 1);
    expect(calls.find((c) => c.method === 'readStore')?.args).toEqual([2, []]);
    expect(text(detail.querySelector('.dt-store-holders'))).toBe('CartView.cart');
    expect(text(detail.querySelector('.dt-kv'))).toContain('total');
    const revealed: number[][] = [];
    devtools.onReveal((path) => revealed.push(path));
    (detail.querySelector('.dt-store-holders .dt-link') as HTMLButtonElement).click();
    expect(revealed).toEqual([[0, 2]]);
  });

  it('says when a store is kept at module level or in a closure', async () => {
    const { root } = await render();
    const detail = await open(root, 0);
    expect(text(detail.querySelector('.dt-store-holders'))).toBe('Module or closure');
  });

  it('names a module store and shows its file', async () => {
    const stores = STORES();
    stores[0] = { ...stores[0], name: 'cart', file: 'src/stores/cart.ts' };
    const { root } = await render(stores);
    expect(text(rows(root)[0].querySelector('.dt-store-name'))).toBe('cart#1');
    const detail = await open(root, 0);
    expect(text(detail.querySelector('.dt-store-holders'))).toBe('Module src/stores/cart.ts');
  });

  it('records the last change of a store from flush triggers', async () => {
    const { root, emit } = await render();
    emit({ type: 'reactivity:flush', payload: { duration: 1, runs: 1, effects: [], triggers: [{ target: {}, key: 'total', count: 2, store: { id: 2, path: [] } }, { target: {}, key: 'name', count: 1, store: { id: 2, path: ['user'] } }] } });
    const detail = await open(root, 1);
    expect(text(detail.querySelector('.dt-store-change'))).toBe(`user.name at ${formatClock(Date.UTC(2026, 9, 13, 9, 30, 0, 0))}`);
    expect(rows(root)[1].classList.contains('changed')).toBe(true);
  });

  it('edits a primitive value through setStoreValue with its type kept', async () => {
    const { root, calls } = await render();
    const detail = await open(root, 1);
    const total = [...detail.querySelectorAll('.dt-prop-row')].find((row) => row.textContent?.includes('total')) as HTMLElement;
    (total.querySelector('.dt-value') as HTMLElement).click();
    await settle();
    const input = total.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('4');
    input.value = '9';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(calls.find((c) => c.method === 'setStoreValue')?.args).toEqual([2, ['total'], 9]);
  });

  it('edits the value of a signal itself', async () => {
    const { root, calls } = await render();
    const detail = await open(root, 2);
    (detail.querySelector('.dt-store-root .dt-value') as HTMLElement).click();
    await settle();
    const input = detail.querySelector('.dt-store-root input') as HTMLInputElement;
    input.value = 'light';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(calls.find((c) => c.method === 'setStoreValue')?.args).toEqual([3, [], 'light']);
  });

  it('does not write a number field that was given text', async () => {
    const { root, calls } = await render();
    const detail = await open(root, 1);
    const total = [...detail.querySelectorAll('.dt-prop-row')].find((row) => row.textContent?.includes('total')) as HTMLElement;
    (total.querySelector('.dt-value') as HTMLElement).click();
    await settle();
    const input = total.querySelector('input') as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(calls.some((c) => c.method === 'setStoreValue')).toBe(false);
    expect(text(detail.querySelector('.dt-store-error'))).toBe('Not a number');
  });

  it('loads again when stores are created or components go away', async () => {
    const { emit, calls } = await render();
    for (const type of ['stores:changed', 'tree:changed', 'component:disposed']) {
      calls.length = 0;
      emit({ type, payload: {} });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
      expect(calls.map((c) => c.method), type).toContain('getStores');
    }
  });

  it('hides released stores until asked to show them', async () => {
    const stores = [...STORES(), { id: 5, name: 'reactive', type: 'reactive', value: { open: false }, holders: [], released: true }];
    const { root } = await render(stores);
    expect(rows(root).map((row) => text(row.querySelector('.dt-store-name')))).not.toContain('reactive#5');
    expect(text(root.querySelector('.dt-store-total'))).toBe('4');
    const toggle = root.querySelector('.dt-released-toggle') as HTMLButtonElement;
    expect(text(toggle)).toBe('Show released (1)');
    toggle.click();
    await settle();
    const released = rows(root).find((row) => text(row.querySelector('.dt-store-name')) === 'reactive#5')!;
    expect(released.classList.contains('released')).toBe(true);
    (released.querySelector('.dt-store-row') as HTMLButtonElement).click();
    await settle();
    expect(text(released.querySelector('.dt-store-holders'))).toBe('Not kept by a component or service anymore');
    expect(text(root.querySelector('.dt-released-toggle'))).toBe('Hide released');
  });

  it('loads again when the page connects', async () => {
    const { connect, calls } = await render();
    calls.length = 0;
    connect();
    await settle();
    expect(calls.map((c) => c.method)).toContain('getStores');
  });

  it('says so when there are no stores', async () => {
    const { root } = await render([]);
    expect(root.querySelector('.dt-store-empty')).not.toBeNull();
  });
});
