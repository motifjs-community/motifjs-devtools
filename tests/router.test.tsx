import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { RouterModel, matchesRoute, routeRows } from '../src/panel/model/RouterModel';
import { RouterPage } from '../src/panel/pages/RouterPage';
import { tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

type Page = {
  routes: unknown;
  route: unknown;
  navigations: Record<string, unknown>[];
};

function fakeClient(page: Page) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: string[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string) {
      calls.push(method);
      if (method === 'getRoutes') return page.routes as T;
      if (method === 'getRoute') return page.route as T;
      if (method === 'getNavigations') return page.navigations.map((n) => ({ ...n })) as T;
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
  return { client, emit, connect, calls };
}

const nav = (requested: string, outcome: string, extra: Record<string, unknown> = {}) => ({
  requested,
  uri: requested,
  outcome,
  duration: 18.4,
  at: Date.UTC(2026, 9, 13, 9, 30, 5, 120),
  ...extra,
});

const fn = (name: string) => ({ $motif: 'function', name });

const ROUTES = [
  {
    path: '/',
    fullPath: '/',
    control: fn('AppShell'),
    childs: [
      { path: '/', fullPath: '/', redirect: '/dashboard' },
      { path: '/dashboard', fullPath: '/dashboard', control: fn('Dashboard'), keepAlive: true },
      { path: '/orders/{id}', fullPath: '/orders/{id}', control: fn('OrderPage'), onEnter: fn('onEnter') },
      {
        path: '/admin',
        control: fn('AdminLayout'),
        validate: fn('validate'),
        onLeave: fn('onLeave'),
        meta: { role: 'admin' },
        childs: [
          { path: 'users', control: fn('UsersPage') },
          { path: 'lazy', control: { $motif: 'object', type: 'Promise', keys: 0 }, redirect: fn('pick') },
        ],
      },
    ],
  },
];

const PAGE = (): Page => ({
  routes: [{ path: '/', childs: [] }],
  route: { uri: '/orders/1042', params: { id: '1042' }, chain: ['/', '/orders/1042'] },
  navigations: [
    nav('/home', 'done', { uri: '/dashboard', duration: 8.6 }),
    nav('/settings', 'cancelled', { uri: '/settings', reason: 'middleware', duration: 2.8 }),
    nav('/orders/1042', 'done', { params: { id: '1042' }, duration: 24.1 }),
  ],
});

let app: Application | null = null;
let model: RouterModel | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(page = PAGE()) {
  const fake = fakeClient(page);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = { connected: true, version: 1 };
  model = new RouterModel(fake.client);
  await model.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(RouterModel, { useValue: model });
  app = builder.build();
  app.run('#app', new RouterPage());
  await settle();
  return { ...fake, page, root: document.querySelector('.dt-router') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const rows = (root: HTMLElement) => [...root.querySelectorAll('.dt-nav-entry')];
const cells = (row: Element) =>
  [...row.querySelectorAll('.dt-nav-row > span:not(.dt-route-cell), .dt-route-cell > *')].map(text).filter(Boolean).join(' ');
const terms = (detail: Element | null) => [...(detail?.querySelectorAll('dt, dd') ?? [])].map(text).join(' ');

describe('Router', () => {
  it('shows the current route with its params and chain', async () => {
    const { root } = await render();
    const card = root.querySelector('.dt-route-card') as HTMLElement;
    expect(text(card.querySelector('.dt-route-uri'))).toBe('/orders/1042');
    expect(text(card.querySelector('.dt-route-chain'))).toBe('/ › /orders/1042');
    expect(text(card.querySelector('.dt-route-params'))).toContain('id');
    expect(text(card.querySelector('.dt-route-params'))).toContain('"1042"');
  });

  it('lists navigations newest first with outcome and duration', async () => {
    const { root } = await render();
    const list = rows(root).map(cells);
    expect(list).toEqual(['01 /orders/1042 done 24.1 ms', '02 /settings cancelled 2.80 ms', '03 /dashboard requested /home done 8.60 ms']);
    expect(rows(root)[1].querySelector('.dt-outcome')?.classList.contains('cancelled')).toBe(true);
  });

  it('opens a navigation to show its details', async () => {
    const { root } = await render();
    (rows(root)[1].querySelector('.dt-nav-row') as HTMLButtonElement).click();
    await settle();
    const detail = rows(root)[1].querySelector('.dt-nav-detail') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(terms(detail)).toContain('Requested /settings');
    expect(terms(detail)).toContain('Reason middleware');
    expect(rows(root)[0].querySelector('.dt-nav-detail')).toBeNull();
    (rows(root)[0].querySelector('.dt-nav-row') as HTMLButtonElement).click();
    await settle();
    expect(rows(root)[1].querySelector('.dt-nav-detail')).toBeNull();
    expect(terms(rows(root)[0].querySelector('.dt-nav-detail'))).toMatch(/Params id\s*"1042"/);
  });

  it('filters by outcome', async () => {
    const { root } = await render();
    model!.setFilter('cancelled');
    await settle();
    expect(rows(root).map((row) => text(row.querySelector('.dt-route-target')))).toEqual(['/settings']);
    model!.setFilter('error');
    await settle();
    expect(rows(root)).toHaveLength(0);
    expect(root.querySelector('.dt-nav-empty')).not.toBeNull();
  });

  it('reloads after a navigation ends and shows the navigation in flight', async () => {
    const { root, emit, page } = await render();
    emit({ type: 'route:navigation-start', payload: { uri: '/settings' } });
    await settle();
    expect(text(root.querySelector('.dt-route-state'))).toBe('Navigating to /settings');
    page.route = { uri: '/settings', params: {}, chain: ['/', '/settings'] };
    page.navigations.push(nav('/settings', 'done', { duration: 4 }));
    emit({ type: 'route:navigation-end', payload: { uri: '/settings', requested: '/settings', outcome: 'done', duration: 4 } });
    await settle();
    expect(text(root.querySelector('.dt-route-uri'))).toBe('/settings');
    expect(text(root.querySelector('.dt-route-state'))).toBe('Runtime connected');
    expect(rows(root)).toHaveLength(4);
  });

  it('loads again when the page connects', async () => {
    const { connect, calls } = await render();
    calls.length = 0;
    connect();
    await settle();
    expect(calls).toEqual(expect.arrayContaining(['getRoutes', 'getRoute', 'getNavigations']));
  });

  it('builds the route tree with full paths, components, redirects and hooks', () => {
    expect(routeRows(ROUTES).map((r) => `${'  '.repeat(r.depth)}${r.path} ${r.fullPath} ${r.control ?? '-'} ${r.redirect ?? '-'} ${r.hooks.join(',') || '-'}${r.keepAlive ? ' keep' : ''}`)).toEqual([
      '/ / AppShell - -',
      '  / / - /dashboard -',
      '  /dashboard /dashboard Dashboard - - keep',
      '  /orders/{id} /orders/{id} OrderPage - onEnter',
      '  /admin /admin AdminLayout - validate,onLeave',
      '    users /admin/users UsersPage - -',
      '    lazy /admin/lazy Promise ƒ pick() -',
    ]);
  });

  it('matches route patterns against addresses', () => {
    expect(matchesRoute('/orders/{id}', '/orders/1042')).toBe(true);
    expect(matchesRoute('/orders/:id', '/orders/1042?tab=2')).toBe(true);
    expect(matchesRoute('/orders/{id}', '/orders')).toBe(false);
    expect(matchesRoute('/', '/')).toBe(true);
    expect(matchesRoute('/dashboard', '/settings')).toBe(false);
  });

  it('shows the route tree in its own tab and marks the chain of the current route', async () => {
    const { root } = await render({ ...PAGE(), routes: ROUTES });
    expect(root.querySelector('.dt-routes')).toBeNull();
    const tabs = [...root.querySelectorAll('.dt-page-tabs button')] as HTMLButtonElement[];
    expect(tabs.map(text)).toEqual(['Current', 'Routes 7']);
    tabs[1].click();
    await settle();
    expect(root.querySelector('.dt-route-card')).toBeNull();
    const nodes = [...root.querySelectorAll('.dt-route-node')];
    expect(nodes.map((n) => text(n.querySelector('.dt-route-path')))).toEqual(['/', '/', '/dashboard', '/orders/{id}', '/admin', 'users', 'lazy']);
    expect(nodes.map((n, i) => (n.classList.contains('active') ? i : -1)).filter((i) => i >= 0)).toEqual([0, 3]);
    expect(nodes[3].classList.contains('current')).toBe(true);
    expect([...nodes[3].querySelectorAll('.dt-route-tag')].map(text)).toEqual(['<OrderPage>', 'onEnter']);
    (nodes[4].querySelector('.dt-route-row') as HTMLButtonElement).click();
    await settle();
    const detail = root.querySelectorAll('.dt-route-node')[4].querySelector('.dt-route-detail');
    expect(terms(detail)).toContain('Full path /admin');
    expect(terms(detail)).toContain('Hooks validate, onLeave');
    expect(terms(detail)).toContain('Children 2');
    expect(terms(detail)).toMatch(/Meta role\s*"admin"/);
  });

  it('says so when the app has no router', async () => {
    const { root } = await render({ routes: null, route: null, navigations: [] });
    expect(root.querySelector('.dt-no-router')).not.toBeNull();
    expect(text(root.querySelector('.dt-route-uri'))).toBe('–');
  });
});
