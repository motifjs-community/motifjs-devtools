import { afterEach, describe, expect, it } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { HomeModel, LINKS } from '../src/panel/model/HomeModel';
import { HomePage } from '../src/panel/pages/HomePage';
import { VERSION } from '../src/version';
import { tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

function fakeClient(routes: unknown = [{ path: '/', fullPath: '/', childs: [{ path: 'a', fullPath: '/a' }] }]) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const calls: string[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string) {
      calls.push(method);
      if (method === 'getStores') return [{ id: 1 }, { id: 2 }, { id: 3, released: true }] as T;
      if (method === 'getServices') return [{ token: 'A' }, { token: 'B' }, { token: 'C' }, { token: 'D' }] as T;
      if (method === 'getRoutes') return routes as T;
      if (method === 'getCounters') return { components: { live: 30, inTree: 24, notInTree: 6, byType: {} }, bindings: 0, listeners: { dom: 0, component: 0 }, effects: { live: 0, owned: 0 }, reactivity: { runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 } } as T;
      if (method === 'getWarnings') return [{}, {}] as T;
      if (method === 'getErrors') return [{}] as T;
      return [] as T;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onStatus: () => () => {},
    onDock: () => () => {},
    setDock() {},
    dispose() {},
  };
  return { client, calls, emit: (event: ClientEvent) => listeners.forEach((l) => l(event)) };
}

let app: Application | null = null;
let home: HomeModel | null = null;

afterEach(async () => {
  home?.dispose();
  home = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
});

async function render(status: ClientStatus, routes?: unknown) {
  const fake = fakeClient(routes);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = status;
  await devtools.refresh();
  home = new HomeModel(fake.client, () => true, 0);
  if (status.connected) await home.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(HomeModel, { useValue: home });
  app = builder.build();
  app.run('#app', new HomePage());
  await settle();
  return { ...fake, devtools, root: document.querySelector('.dt-home') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const cells = (el: Element | null | undefined) => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ');

describe('Home', () => {
  it('shows the DevTools, MotifJS and contract versions and where it is connected', async () => {
    const { root } = await render({ connected: true, version: 1, host: 'localhost:5199', coreVersion: '1.2.0-rc.5' });
    expect([...root.querySelectorAll('.dt-version-chip')].map(cells)).toEqual([`DevTools v${VERSION}`, 'MotifJS 1.2.0-rc.5', 'Contract v1']);
    expect(text(root.querySelector('.dt-hero-status'))).toBe('Connected to localhost:5199');
  });

  it('sums up the app and opens a screen from a card', async () => {
    const { root, devtools } = await render({ connected: true, version: 1, coreVersion: '1.2.0' });
    const stats = [...root.querySelectorAll('.dt-home-stat')];
    expect(stats.map(cells)).toEqual(['COMPONENTS 24 in the tree', 'STORES 2 in use', 'SERVICES 4 registered', 'ROUTES 2 configured', 'ISSUES 3 warnings and errors']);
    (stats[2] as HTMLButtonElement).click();
    expect(devtools.state.section).toBe('services');
  });

  it('says when the app has no router', async () => {
    const { root } = await render({ connected: true, version: 1 }, null);
    expect(cells(root.querySelectorAll('.dt-home-stat')[3])).toBe('ROUTES – no router');
  });

  it('links to the project, the docs and where to report a bug or share an idea', async () => {
    const { root } = await render({ connected: true, version: 1 });
    const links = [...root.querySelectorAll('.dt-home-link')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(LINKS.map((l) => l.href));
    expect(links.every((a) => a.target === '_blank' && a.rel.includes('noopener'))).toBe(true);
    expect((root.querySelector('.dt-star') as HTMLAnchorElement).getAttribute('href')).toBe('https://github.com/motifjsdev/motifjs');
    expect(text(links.find((a) => a.classList.contains('idea')))).toContain('Share an idea');
  });

  it('shows the versions and links before the app connects', async () => {
    const { root } = await render({ connected: false, version: null, reason: 'missing' });
    expect(text(root.querySelector('.dt-hero-status'))).toBe('Waiting for the app: call app.useDevelopment(true)');
    expect(cells(root.querySelectorAll('.dt-version-chip')[1])).toBe('MotifJS –');
    expect(root.querySelectorAll('.dt-home-link').length).toBe(LINKS.length);
  });

  it('counts again when stores or services change', async () => {
    const { emit, calls } = await render({ connected: true, version: 1 });
    calls.length = 0;
    emit({ type: 'stores:changed', payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(calls).toEqual(expect.arrayContaining(['getStores', 'getServices', 'getRoutes']));
  });
});
