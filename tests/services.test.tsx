import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { ServicesModel, scopeRows, type ScopeInfo } from '../src/panel/model/ServicesModel';
import { ServicesPage } from '../src/panel/pages/ServicesPage';
import { formatClock } from '../src/panel/format';
import { idleClient, tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

type Call = { method: string; args: unknown[] };

const REGISTRATIONS = () => [
  { token: 'ThemeService', lifetime: 'singleton', created: true },
  { token: 'ApiClient', lifetime: 'singleton', created: false },
  { token: 'CartService', lifetime: 'scoped', created: true },
  { token: 'OrderDraft', lifetime: 'scoped', created: false },
  { token: 'Logger', lifetime: 'transient', created: false },
];

const SCOPES = (): ScopeInfo[] => [
  { id: 1, kind: 'root', name: null, parent: null, current: false, pending: false, pins: 0, services: [{ token: 'ThemeService', lifetime: 'singleton', instance: { kind: 'object', type: 'ThemeService', keys: 1 } }], transients: [] },
  { id: 2, kind: 'navigation', name: 'navigation', parent: 1, current: false, pending: false, pins: 1, services: [{ token: 'CartService', lifetime: 'scoped', instance: { kind: 'object', type: 'CartService', keys: 2 } }], transients: [] },
  { id: 4, kind: 'navigation', name: 'navigation', parent: 1, current: true, pending: false, pins: 0, services: [{ token: 'CartService', lifetime: 'scoped', instance: { kind: 'object', type: 'CartService', keys: 2 } }], transients: [] },
  { id: 5, kind: 'user', name: 'own', parent: 1, current: false, pending: false, pins: 0, services: [], transients: [{ kind: 'object', type: 'Logger', keys: 0 }] },
  { id: 6, kind: 'user', name: 'inner', parent: 5, current: false, pending: false, pins: 0, services: [{ token: 'OrderDraft', lifetime: 'scoped', instance: null, creating: true }], transients: [] },
];

function fakeClient(scopes = SCOPES(), registrations = REGISTRATIONS()) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: Call[] = [];
  const data = { scopes, registrations };
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string, ...args: unknown[]) {
      calls.push({ method, args });
      if (method === 'getServices') return data.registrations.map((r) => ({ ...r })) as T;
      if (method === 'getScopes') return structuredClone(data.scopes) as T;
      if (method === 'readService') {
        const [scope, token, keys] = args as [number, string, string[]];
        if (scope === 4 && token === 'CartService' && keys.length === 0) return { ok: true, value: { value: { kind: 'object', type: 'CartService', keys: 2 }, entries: [{ key: 'items', value: { kind: 'array', length: 1 } }, { key: 'total', value: 24 }], total: 2 } } as T;
        if (scope === 4 && token === 'CartService' && keys[0] === 'items') return { ok: true, value: { value: { kind: 'array', length: 1 }, entries: [{ key: '0', value: { kind: 'object', type: 'Object', keys: 2 } }], total: 1 } } as T;
        return { ok: false, error: 'no service' } as T;
      }
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
    ...idleClient,
    setDock() {},
    dispose() {},
  };
  const emit = (event: ClientEvent) => {
    for (const listener of listeners) listener(event);
  };
  return { client, emit, calls, data };
}

let app: Application | null = null;
let model: ServicesModel | null = null;
const AT = Date.UTC(2026, 9, 13, 9, 30, 0, 0);

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(scopes = SCOPES(), registrations = REGISTRATIONS()) {
  const fake = fakeClient(scopes, registrations);
  model = new ServicesModel(fake.client, () => true, 0, () => AT);
  await model.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(ServicesModel, { useValue: model });
  app = builder.build();
  app.run('#app', new ServicesPage());
  await settle();
  return { ...fake, root: document.querySelector('.dt-services') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)];
const cells = (row: Element) => all(row, ':scope > *').map(text).filter(Boolean).join(' | ');
const scopeTexts = (root: HTMLElement) => all(root, '.dt-scope-row').map(cells);
const slotTexts = (root: HTMLElement) => all(root, '.dt-service-row').map(cells);

describe('Services', () => {
  it('orders scopes as a tree under their parents', () => {
    expect(scopeRows(SCOPES())).toEqual([
      { id: 1, depth: 0 },
      { id: 2, depth: 1 },
      { id: 4, depth: 1 },
      { id: 5, depth: 1 },
      { id: 6, depth: 2 },
    ]);
  });

  it('sums up the registrations and names the current scope', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.dt-service-total'))).toBe('5 services registered · 2 active');
    expect(text(root.querySelector('.dt-service-card small'))).toBe('Current scope: navigation #4');
    expect(text(root.querySelector('.dt-service-card .dt-log-split'))).toBe('2 singleton · 2 scoped · 1 transient');
  });

  it('lists the scopes with their state and selects the current one', async () => {
    const { root } = await render();
    expect(scopeTexts(root)).toEqual(['root#1 | 1', 'navigation#2 | kept by 1 | 1', 'navigation#4 | current | 1', 'own#5 | user | 1', 'inner#6 | user | 0']);
    expect(all(root, '.dt-scope-row')[2].classList.contains('selected')).toBe(true);
    expect(text(root.querySelector('.dt-scope-title'))).toBe('navigation #4 · current');
  });

  it('shows the scoped services of a scope and the ones not created there', async () => {
    const { root } = await render();
    expect(slotTexts(root)).toEqual(['CartService | scoped | CartService {2}', 'OrderDraft | scoped | not created']);
    expect(all(root, '.dt-service-entry')[1].classList.contains('idle')).toBe(true);
  });

  it('shows singletons when the root is selected', async () => {
    const { root } = await render();
    (all(root, '.dt-scope-row')[0] as HTMLButtonElement).click();
    await settle();
    expect(slotTexts(root)).toEqual(['ThemeService | singleton | ThemeService {1}', 'ApiClient | singleton | not created']);
  });

  it('marks a service still being created and lists kept transients', async () => {
    const { root } = await render();
    (all(root, '.dt-scope-row')[4] as HTMLButtonElement).click();
    await settle();
    expect(slotTexts(root)[0]).toBe('OrderDraft | scoped | creating…');
    (all(root, '.dt-scope-row')[3] as HTMLButtonElement).click();
    await settle();
    expect(cells(root.querySelector('.dt-transients')!)).toBe('TRANSIENTS KEPT FOR DISPOSAL | Logger {0}');
  });

  it('opens a service to read its fields one level at a time', async () => {
    const { root, calls } = await render();
    (all(root, '.dt-service-row')[0] as HTMLButtonElement).click();
    await settle();
    expect(calls.find((c) => c.method === 'readService')?.args).toEqual([4, 'CartService', []]);
    const detail = root.querySelector('.dt-service-detail') as HTMLElement;
    expect(all(detail, '.dt-prop-row').map(cells)).toEqual(['items | Array(1)', 'total | 24']);
    (detail.querySelector('.dt-prop-row .dt-caret') as HTMLButtonElement).click();
    await settle();
    expect(calls.filter((c) => c.method === 'readService').at(-1)?.args).toEqual([4, 'CartService', ['items']]);
  });

  it('reads an open service again after a reactivity flush', async () => {
    const { root, emit, calls } = await render();
    emit({ type: 'reactivity:flush', payload: { duration: 1, runs: 1, triggers: [], effects: [] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(calls.some((c) => c.method === 'readService')).toBe(false);
    (all(root, '.dt-service-row')[0] as HTMLButtonElement).click();
    await settle();
    calls.length = 0;
    emit({ type: 'reactivity:flush', payload: { duration: 1, runs: 1, triggers: [], effects: [] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(calls.filter((c) => c.method === 'readService').map((c) => c.args)).toEqual([[4, 'CartService', []]]);
  });

  it('does not open a service that was not created', async () => {
    const { root, calls } = await render();
    (all(root, '.dt-service-row')[1] as HTMLButtonElement).click();
    await settle();
    expect(calls.some((c) => c.method === 'readService')).toBe(false);
  });

  it('describes every registration and filters by lifetime', async () => {
    const { root } = await render();
    expect(all(root, '.dt-registration').map(cells)).toEqual([
      'ThemeService | singleton | active',
      'ApiClient | singleton | not requested yet',
      'CartService | scoped | active in 2 scopes',
      'OrderDraft | scoped | not requested yet',
      'Logger | transient | created on every request',
    ]);
    model!.setFilter('scoped');
    await settle();
    expect(all(root, '.dt-registration').map(cells)).toEqual(['CartService | scoped | active in 2 scopes', 'OrderDraft | scoped | not requested yet']);
  });

  it('records created and disposed services as activity, newest first', async () => {
    const { root, emit } = await render();
    emit({ type: 'service:created', payload: { scope: 4, token: 'CartService', lifetime: 'scoped', source: 'class', instance: {} } });
    emit({ type: 'service:disposed', payload: { scope: 2, token: 'CartService', lifetime: 'scoped', instance: {} } });
    await settle();
    const clock = formatClock(AT);
    expect(all(root, '.dt-activity').map(cells)).toEqual([`${clock} | disposed | CartService | navigation #2`, `${clock} | created | CartService | navigation #4`]);
    model!.state.scopes = model!.state.scopes.filter((s) => s.id !== 2);
    await settle();
    expect(cells(all(root, '.dt-activity')[0])).toBe(`${clock} | disposed | CartService | navigation #2`);
    model!.clearActivity();
    await settle();
    expect(all(root, '.dt-activity')).toHaveLength(0);
  });

  it('follows the current scope after a navigation unless another scope was picked', async () => {
    const { data, emit } = await render();
    data.scopes = [SCOPES()[0], { ...SCOPES()[2], current: false }, { id: 7, kind: 'navigation', name: 'navigation', parent: 1, current: true, pending: false, pins: 0, services: [], transients: [] }];
    emit({ type: 'scopes:changed', payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(model!.state.selected).toBe(7);
    model!.select(4);
    data.scopes = [SCOPES()[0], { ...SCOPES()[2], current: false }, { id: 8, kind: 'navigation', name: 'navigation', parent: 1, current: true, pending: false, pins: 0, services: [], transients: [] }];
    emit({ type: 'route:navigation-end', payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(model!.state.selected).toBe(4);
  });

  it('loads again when services or scopes change', async () => {
    const { emit, calls } = await render();
    for (const type of ['scopes:changed', 'service:created', 'service:disposed', 'route:navigation-end']) {
      calls.length = 0;
      emit({ type, payload: { scope: 1, token: 'X', lifetime: 'singleton' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
      expect(calls.map((c) => c.method), type).toContain('getScopes');
    }
  });
});
