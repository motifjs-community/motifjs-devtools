import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '@motifx/core';
import type { Client, ClientEvent, ClientStatus } from '../src/client/client';
import { DevtoolsModel } from '../src/panel/model/DevtoolsModel';
import { LogsModel } from '../src/panel/model/LogsModel';
import { LogsPage } from '../src/panel/pages/LogsPage';
import { tick } from './helpers';

const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

type Page = { warnings: Record<string, unknown>[]; errors: Record<string, unknown>[] };

function fakeClient(page: Page) {
  const listeners = new Set<(event: ClientEvent) => void>();
  const statuses = new Set<(status: ClientStatus) => void>();
  const calls: string[] = [];
  const client: Client = {
    status: { connected: true, version: 1 } as ClientStatus,
    dock: null,
    async request<T>(method: string) {
      calls.push(method);
      if (method === 'getWarnings') return page.warnings.map((w) => ({ ...w })) as T;
      if (method === 'getErrors') return page.errors.map((e) => ({ ...e })) as T;
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

const at = (minute: number) => Date.UTC(2026, 9, 13, 9, minute, 0, 0);

const PAGE = (): Page => ({
  warnings: [
    { code: 'MJX204', message: 'Missing key in list binding', details: { index: 3 }, count: 4, firstAt: at(1), lastAt: at(9) },
    { code: 'MJX118', message: 'Detached component retained', count: 2, firstAt: at(2), lastAt: at(5) },
  ],
  errors: [
    {
      context: 'Router',
      name: 'Error',
      message: 'Navigation guard rejected',
      error: { name: 'Error', message: 'Navigation guard rejected', stack: 'Error: Navigation guard rejected\n    at guard (app.ts:4:9)', cause: { name: 'TypeError', message: 'x is undefined' } },
      count: 1,
      firstAt: at(7),
      lastAt: at(7),
    },
  ],
});

let app: Application | null = null;
let model: LogsModel | null = null;

afterEach(async () => {
  model?.dispose();
  model = null;
  await app?.dispose?.();
  app = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

async function render(page = PAGE()) {
  const fake = fakeClient(page);
  const devtools = new DevtoolsModel(fake.client);
  devtools.state.status = { connected: true, version: 1 };
  model = new LogsModel(fake.client, 0);
  await model.load();
  document.body.innerHTML = '<div id="app"></div>';
  const builder = Application.CreateBuilder();
  builder.services.addSingleton(DevtoolsModel, { useValue: devtools });
  builder.services.addSingleton(LogsModel, { useValue: model });
  app = builder.build();
  app.run('#app', new LogsPage());
  await settle();
  return { ...fake, page, root: document.querySelector('.dt-logs') as HTMLElement };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const rows = (root: HTMLElement) => [...root.querySelectorAll('.dt-log-entry')];
const cells = (row: Element) => [...row.querySelectorAll('.dt-log-row > span')].map(text).filter(Boolean).join(' | ');
const terms = (detail: Element | null) => [...(detail?.querySelectorAll('dt, dd') ?? [])].map(text).join(' ');

describe('Logs', () => {
  it('counts warnings and errors in the summary', async () => {
    const { root } = await render();
    expect(text(root.querySelector('.dt-log-total'))).toBe('3');
    expect(text(root.querySelector('.dt-log-split'))).toBe('2 warnings, 1 error');
  });

  it('lists warnings and errors together, most recently seen first', async () => {
    const { root } = await render();
    expect(rows(root).map(cells)).toEqual([
      '01 | MJX204 | warning × 4 | Missing key in list binding',
      '02 | Router | error × 1 | Navigation guard rejected',
      '03 | MJX118 | warning × 2 | Detached component retained',
    ]);
    expect(rows(root)[1].querySelector('.dt-level')?.classList.contains('error')).toBe(true);
  });

  it('opens a warning to show when it was seen and its details', async () => {
    const { root } = await render();
    (rows(root)[0].querySelector('.dt-log-row') as HTMLButtonElement).click();
    await settle();
    const detail = terms(rows(root)[0].querySelector('.dt-log-detail'));
    expect(detail).toContain('Count 4');
    expect(detail).toMatch(/Details index\s*3/);
    expect(rows(root)[1].querySelector('.dt-log-detail')).toBeNull();
  });

  it('opens an error to show its stack and cause', async () => {
    const { root } = await render();
    (rows(root)[1].querySelector('.dt-log-row') as HTMLButtonElement).click();
    await settle();
    const detail = rows(root)[1].querySelector('.dt-log-detail');
    expect(text(detail?.querySelector('.dt-stack'))).toContain('at guard (app.ts:4:9)');
    expect(terms(detail)).toContain('Cause TypeError: x is undefined');
  });

  it('filters by level', async () => {
    const { root } = await render();
    model!.setFilter('error');
    await settle();
    expect(rows(root).map((row) => text(row.querySelector('.dt-log-title')))).toEqual(['Router']);
    model!.setFilter('warning');
    await settle();
    expect(rows(root)).toHaveLength(2);
  });

  it('reloads after a warning or an error arrives', async () => {
    const { root, emit, page } = await render();
    page.warnings.push({ code: 'MJX310', message: 'Empty route path', count: 1, firstAt: at(20), lastAt: at(20) });
    emit({ type: 'warning', payload: { code: 'MJX310', message: 'Empty route path' } });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(text(rows(root)[0].querySelector('.dt-log-title'))).toBe('MJX310');
    page.errors[0] = { ...page.errors[0], count: 2, lastAt: at(30) };
    emit({ type: 'error:caught', payload: { context: 'Router', error: {} } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
    expect(rows(root).map(cells)[0]).toBe('01 | Router | error × 2 | Navigation guard rejected');
  });

  it('loads again when the page connects', async () => {
    const { connect, calls } = await render();
    calls.length = 0;
    connect();
    await settle();
    expect(calls).toEqual(expect.arrayContaining(['getWarnings', 'getErrors']));
  });

  it('says so when nothing was reported', async () => {
    const { root } = await render({ warnings: [], errors: [] });
    expect(root.querySelector('.dt-log-empty')).not.toBeNull();
    expect(text(root.querySelector('.dt-log-total'))).toBe('0');
  });
});
