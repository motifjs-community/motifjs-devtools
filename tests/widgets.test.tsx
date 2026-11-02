import { afterEach, describe, expect, it } from 'vitest';
import type { Widget } from '../src/panel/schema';
import { knownWidgets } from '../src/panel/widgets';
import { cleanup, renderPanel, settle, text, texts, type FakePage, type Rendered } from './extension-helpers';

const SCHEMA_TYPES: Widget['type'][] = ['stack', 'toolbar', 'split', 'tabs', 'text', 'counter', 'badge', 'json', 'code', 'button', 'filter', 'table', 'tree', 'detail', 'chart', 'log', 'timeline'];

describe('widget registry', () => {
  it('has a view for every widget of the schema', () => {
    expect([...knownWidgets()].sort()).toEqual([...SCHEMA_TYPES].sort());
  });
});

const ORDERS = [
  { id: 3, customer: 'Grace', total: 210, status: 'shipped', items: [{ name: 'Tea', qty: 2 }], note: 'line one\nline two' },
  { id: 1, customer: 'Ada', total: 120, status: 'paid', items: [], note: 'one line' },
  { id: 2, customer: 'Linus', total: 64, status: 'new', items: [{ name: 'Cake', qty: 1 }], note: '' },
];

const TREE = [
  { id: 'a', name: 'Alpha', count: 2, children: [{ id: 'a1', name: 'Alpha one', count: 0, children: [] }, { id: 'a2', name: 'Alpha two', count: 1, children: [{ id: 'a2x', name: 'Deep', count: 0, children: [] }] }] },
  { id: 'b', name: 'Beta', count: 0, children: [] },
];

const NOW = Date.now();

const EVENTS = () => [
  { id: 'a', name: 'cart/add', at: NOW - 50_000, took: 3000, lane: 'actions', level: 'info' },
  { id: 'b', name: 'orders/load', at: NOW - 20_000, took: 0, lane: 'actions', level: 'warn' },
  { id: 'c', name: '/settings', at: NOW - 5_000, took: 1200, lane: 'navigation', level: 'info' },
  { id: 'old', name: 'ancient', at: NOW - 600_000, took: 10, lane: 'actions', level: 'info' },
];

const page = (layout: Widget, sources: Record<string, unknown> = {}): FakePage => ({
  extensions: {
    shop: {
      sources,
      commands: ['bump'],
      panels: [{ id: 'main', title: 'Shop', capabilities: { read: true, subscribe: true, write: true }, layout }],
      read: (_panel, source, params) => {
        if (source === 'orders') return ORDERS;
        if (source === 'order') return ORDERS.find((order) => order.id === params.id) ?? null;
        if (source === 'tree') return TREE;
        if (source === 'statuses') return [{ code: 'new', label: 'New' }, { code: 'paid', label: 'Paid' }];
        if (source === 'cut') return [...ORDERS, { $motif: 'truncated', remaining: 40 }];
        if (source === 'events') return EVENTS();
        return null;
      },
      call: () => 'ok',
    },
  },
});

let shown: Rendered | null = null;

const render = async (layout: Widget, sources?: Record<string, unknown>) => {
  shown = await renderPanel(page(layout, sources), 'ext:shop:main');
  return shown;
};

const panelOf = (rendered: Rendered) => rendered.model.state.panels[0];

const rows = (root: ParentNode) => [...root.querySelectorAll('.dt-trow')].map((row) => texts(row, '.dt-tcell').join(' '));

afterEach(async () => {
  await cleanup(shown);
  shown = null;
});

describe('layout widgets', () => {
  it('splits two widgets with a divider whose share comes from the size and moves with the keyboard', async () => {
    const { root } = await render({ type: 'split', size: 0.3, primary: { type: 'text', text: 'left' }, secondary: { type: 'text', text: 'right' } });
    const split = root.querySelector<HTMLElement>('.dt-w-split')!;
    expect(texts(split, '.dt-split-pane .dt-w-value')).toEqual(['left', 'right']);
    expect(split.style.getPropertyValue('--dt-split')).toBe('30%');
    const divider = split.querySelector<HTMLElement>('.dt-split-divider')!;
    divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(split.style.getPropertyValue('--dt-split')).toBe('35%');
    for (let i = 0; i < 20; i++) divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(split.style.getPropertyValue('--dt-split')).toBe('10%');
  });

  it('shows one tab at a time and keeps the open one in the panel state when asked', async () => {
    const rendered = await render({ type: 'tabs', state: 'tab', tabs: [{ title: 'One', layout: { type: 'text', text: 'first' } }, { title: 'Two', layout: { type: 'text', text: 'second' } }] });
    const { root } = rendered;
    const panes = [...root.querySelectorAll<HTMLElement>('.dt-tabs-pane')];
    expect(texts(root, '.dt-tab')).toEqual(['One', 'Two']);
    expect(panes.map((pane) => pane.classList.contains('dt-w-hidden'))).toEqual([false, true]);
    root.querySelectorAll<HTMLButtonElement>('.dt-tab')[1].click();
    await settle();
    expect(panes.map((pane) => pane.classList.contains('dt-w-hidden'))).toEqual([true, false]);
    expect(panelOf(rendered).values.tab).toBe(1);
    rendered.model.setValue(panelOf(rendered), 'tab', 'One');
    await settle();
    expect(panes[0].classList.contains('dt-w-hidden')).toBe(false);
  });
});

describe('simple widgets', () => {
  it('shows a badge with the tone picked by its text', async () => {
    const rendered = await render({ type: 'badge', source: 'order', params: { id: { state: 'id' } }, field: 'status', tones: { paid: 'success', new: 'info' } });
    rendered.model.setValue(panelOf(rendered), 'id', 1);
    await settle();
    const chip = rendered.root.querySelector('.dt-chip')!;
    expect(text(chip)).toBe('paid');
    expect(chip.classList.contains('tone-success')).toBe(true);
  });

  it('shows code with one numbered line per line and a copy button', async () => {
    const { root } = await render({ type: 'code', source: 'order', params: { id: 1 }, language: 'json' });
    const lines = texts(root, '.dt-code-line');
    expect(lines[0]).toBe('{');
    expect(lines.some((line) => line === '"customer": "Ada",')).toBe(true);
    expect(text(root.querySelector('.dt-code-head button'))).toBe('Copy');
  });
});

describe('filters', () => {
  it('writes search text, a typed choice and a switch into the panel state', async () => {
    const rendered = await render({
      type: 'stack',
      children: [
        { type: 'filter', kind: 'search', state: 'q', placeholder: 'Find' },
        { type: 'filter', kind: 'select', state: 'pick', options: [1, { value: true, label: 'Yes' }] },
        { type: 'filter', kind: 'toggle', state: 'on', label: 'Only open' },
      ],
    });
    const { root } = rendered;
    const search = root.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'ada';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const select = root.querySelector<HTMLSelectElement>('select')!;
    expect(texts(select, 'option')).toEqual(['All', '1', 'Yes']);
    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const toggle = root.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(panelOf(rendered).values).toEqual({ q: 'ada', pick: true, on: true });
  });

  it('takes its choices from a source', async () => {
    const { root } = await render({ type: 'filter', kind: 'select', state: 'status', options: { source: 'statuses', itemValue: 'code', itemLabel: 'label' } });
    expect(texts(root, 'option')).toEqual(['All', 'New', 'Paid']);
  });
});

describe('table', () => {
  const table: Widget = {
    type: 'table',
    source: 'orders',
    key: 'id',
    select: 'chosen',
    filters: [{ field: 'customer', state: 'q' }],
    columns: [{ field: 'id', title: 'Order' }, { field: 'customer' }, { field: 'total', format: 'number', align: 'end' }],
  };

  it('lists the rows with formatted cells, sorts by a header and selects a row into the state', async () => {
    const rendered = await render(table);
    const { root } = rendered;
    expect(texts(root, '.dt-th')).toEqual(['Order', 'customer', 'total']);
    expect(rows(root)).toEqual(['3 Grace 210', '1 Ada 120', '2 Linus 64']);
    root.querySelectorAll<HTMLButtonElement>('.dt-th')[2].click();
    await settle();
    expect(rows(root)).toEqual(['2 Linus 64', '1 Ada 120', '3 Grace 210']);
    root.querySelectorAll<HTMLButtonElement>('.dt-th')[2].click();
    await settle();
    expect(rows(root)[0]).toBe('3 Grace 210');
    root.querySelectorAll<HTMLElement>('.dt-trow')[1].click();
    await settle();
    expect(panelOf(rendered).values.chosen).toBe(1);
    expect(root.querySelectorAll<HTMLElement>('.dt-trow')[1].classList.contains('selected')).toBe(true);
  });

  it('narrows the rows by the filters other widgets wrote and says when the list was cut', async () => {
    const rendered = await render({ type: 'stack', children: [table, { type: 'table', source: 'cut', columns: [{ field: 'id' }] }] });
    rendered.model.setValue(panelOf(rendered), 'q', 'li');
    await settle();
    const tables = rendered.root.querySelectorAll('.dt-w-table');
    expect(rows(tables[0])).toEqual(['2 Linus 64']);
    expect(text(tables[1].querySelector('.dt-w-more'))).toBe('40 more rows were not sent (limit of one read)');
    expect(rows(tables[1])).toHaveLength(3);
  });
});

describe('tree', () => {
  const tree: Widget = { type: 'tree', source: 'tree', key: 'id', itemTitle: 'name', itemChildren: 'children', itemBadge: 'count', select: 'node', filters: [{ field: 'name', state: 'q' }] };

  it('opens a level at a time and selects a node into the state', async () => {
    const rendered = await render(tree);
    const { root } = rendered;
    expect(texts(root, '.dt-row-title')).toEqual(['Alpha', 'Beta']);
    expect(texts(root, '.dt-row .dt-chip')).toEqual(['2']);
    root.querySelector<HTMLButtonElement>('.dt-row .dt-caret')!.click();
    await settle();
    expect(texts(root, '.dt-row-title')).toEqual(['Alpha', 'Alpha one', 'Alpha two', 'Beta']);
    expect(root.querySelectorAll<HTMLElement>('.dt-row')[1].style.getPropertyValue('--depth')).toBe('1');
    root.querySelectorAll<HTMLElement>('.dt-row')[2].click();
    await settle();
    expect(panelOf(rendered).values.node).toBe('a2');
  });

  it('flattens to what matches while a filter is on', async () => {
    const rendered = await render(tree);
    rendered.model.setValue(panelOf(rendered), 'q', 'deep');
    await settle();
    expect(texts(rendered.root, '.dt-row-title')).toEqual(['Deep']);
    expect(rendered.root.querySelector<HTMLElement>('.dt-row')!.style.getPropertyValue('--depth')).toBe('0');
  });
});

describe('detail', () => {
  it('shows the sections of a record by what their values are and runs its actions', async () => {
    const rendered = await render({
      type: 'detail',
      source: 'order',
      params: { id: { state: 'id' } },
      sections: ['customer', { field: 'total', format: 'number' }, 'items', 'note', { field: 'status', title: 'State', view: 'json' }],
      actions: [{ type: 'button', label: 'Bump', command: 'bump', args: { id: { state: 'id' } } }],
      empty: 'Pick one',
    });
    const { root, calls } = rendered;
    expect(text(root.querySelector('.dt-w-empty'))).toBe('Pick one');
    rendered.model.setValue(panelOf(rendered), 'id', 3);
    await settle();
    const sections = [...root.querySelectorAll('.dt-detail-section')].filter((section) => !section.hasAttribute('hidden'));
    expect(sections.map((section) => text(section.querySelector('.dt-w-title')))).toEqual(['customer', 'total', 'items', 'note', 'State']);
    expect(text(sections[0].querySelector('.dt-w-value'))).toBe('Grace');
    expect(text(sections[1].querySelector('.dt-w-value'))).toBe('210');
    expect(texts(sections[2], '.dt-th')).toEqual(['name', 'qty']);
    expect(rows(sections[2])).toEqual(['Tea 2']);
    expect(text(sections[3].querySelector('.dt-code'))).toBe('line one line two');
    expect(text(sections[4].querySelector('.dt-code'))).toBe('"shipped"');
    root.querySelector<HTMLButtonElement>('.dt-detail-actions button')!.click();
    await settle();
    expect(calls.find((call) => call[0] === 'callExtension')).toEqual(['callExtension', 'shop', 'main', 'bump', { id: 3 }]);
    rendered.model.setValue(panelOf(rendered), 'id', 1);
    await settle();
    expect([...root.querySelectorAll('.dt-detail-section')].filter((section) => !section.hasAttribute('hidden')).map((section) => text(section.querySelector('.dt-w-title')))).toEqual(['customer', 'total', 'note', 'State']);
  });
});

describe('log', () => {
  it('lists the lines newest first with a time, a level chip and the title, narrowed by the filters', async () => {
    const rendered = await render({ type: 'log', source: 'events', itemTime: 'at', itemTitle: 'name', itemLevel: 'level', levelTones: { warn: 'warning' }, filters: [{ field: 'name', state: 'q' }] });
    const { root } = rendered;
    const lines = () => texts(root, '.dt-logline-title');
    expect(lines()).toEqual(['ancient', '/settings', 'orders/load', 'cart/add']);
    const chips = [...root.querySelectorAll('.dt-logline .dt-chip')];
    expect(chips.map(text)).toEqual(['info', 'info', 'warn', 'info']);
    expect(chips[2].classList.contains('tone-warning')).toBe(true);
    expect(texts(root, '.dt-logline-time')[1]).toMatch(/^\d\d:\d\d:\d\d\.\d{3}$/);
    rendered.model.setValue(panelOf(rendered), 'q', 'orders');
    await settle();
    expect(lines()).toEqual(['orders/load']);
  });
});

describe('timeline', () => {
  const timeline: Widget = {
    type: 'timeline',
    source: 'events',
    key: 'id',
    itemTime: 'at',
    itemDuration: 'took',
    itemTitle: 'name',
    itemStatus: 'level',
    statusTones: { warn: 'warning' },
    itemLane: 'lane',
    select: 'picked',
    live: false,
  };

  it('puts the rows of the window in lanes, as bars or dots, and selects one into the state', async () => {
    const rendered = await render(timeline);
    const { root } = rendered;
    expect(texts(root, '.dt-tl-label')).toEqual(['actions', 'navigation']);
    const bars = [...root.querySelectorAll<HTMLElement>('.dt-tl-bar')];
    expect(bars.map((bar) => bar.dataset.key)).toEqual(['a', 'b', 'c']);
    expect(bars[1].classList.contains('dot')).toBe(true);
    expect(bars[1].classList.contains('tone-warning')).toBe(true);
    expect(bars[0].title).toBe('cart/add · info · 3.00 s');
    expect(parseFloat(bars[2].style.left)).toBeGreaterThan(parseFloat(bars[0].style.left));
    expect(texts(root, '.dt-tl-axis span').at(-1)).toBe('now');
    bars[0].click();
    await settle();
    expect(panelOf(rendered).values.picked).toBe('a');
    expect(root.querySelector<HTMLElement>('.dt-tl-bar[data-key="a"]')!.classList.contains('open')).toBe(true);
  });

  it('shows more of the past when a wider window is picked', async () => {
    const { root } = await render(timeline);
    expect(root.querySelectorAll('.dt-tl-bar')).toHaveLength(3);
    [...root.querySelectorAll<HTMLButtonElement>('.dt-tl-window')].find((button) => text(button) === '5 min')!.click();
    await settle();
    expect(root.querySelectorAll('.dt-tl-bar')).toHaveLength(3);
    expect(texts(root, '.dt-tl-axis span')[0]).toBe('−5 min');
  });
});

describe('chart', () => {
  it('draws bars for a series and a line over a window of rows', async () => {
    const { root } = await render({
      type: 'stack',
      children: [
        { type: 'chart', kind: 'bar', source: 'orders', itemX: 'id', series: 'total', label: 'Totals' },
        { type: 'chart', kind: 'line', source: 'orders', series: ['total', 'id'], window: 2 },
        { type: 'chart', kind: 'spark', source: 'orders', series: 'total' },
      ],
    });
    const charts = root.querySelectorAll('.dt-w-chart');
    expect(charts[0].querySelectorAll('rect')).toHaveLength(3);
    expect(text(charts[0].querySelector('.dt-w-title'))).toBe('Totals');
    expect(texts(charts[0], '.dt-chart-label')).toEqual(['210', '0', '1', '3']);
    const lines = charts[1].querySelectorAll('polyline');
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute('points')!.split(' ')).toHaveLength(2);
    expect(charts[2].querySelectorAll('text')).toHaveLength(0);
    expect(charts[2].querySelector('svg')!.getAttribute('height')).toBe('32');
  });
});
