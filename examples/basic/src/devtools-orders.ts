import { effect } from '@motifx/core';
import { registerDevtools } from '@motifx/core/devtools';
import type { PanelMetadata } from '@motifx-community/devtools';
import { addOrder, advanceFirstOrder, advanceOrder, orders, removeLastOrder, revenue } from './stores';

// The shop's orders as a package would show them: the store as it is, a table with the selected order's detail,
// filters, a chart and the commands the Dashboard has too.
const refresh = ['orders', 'summary', 'order'];

type Change = { at: number; what: string; count: number; took: number };
const activity: Change[] = [];

const panel: PanelMetadata = {
  id: 'orders',
  title: 'Orders',
  icon: 'list',
  order: 45,
  capabilities: { read: true, subscribe: true, write: true },
  layout: {
    type: 'stack',
    children: [
      {
        type: 'toolbar',
        children: [
          { type: 'counter', label: 'orders', source: 'orders' },
          { type: 'counter', label: 'revenue', source: 'summary', field: 'revenue', format: 'number', tone: 'success' },
          { type: 'filter', kind: 'search', state: 'customer', placeholder: 'Customer' },
          { type: 'filter', kind: 'select', state: 'status', placeholder: 'Any status', options: ['new', 'paid', 'shipped'] },
          { type: 'button', label: 'Add order', icon: 'play', command: 'add', refresh },
          { type: 'button', label: 'Advance first', command: 'advance', refresh },
          { type: 'button', label: 'Remove last', icon: 'trash', tone: 'danger', command: 'removeLast', confirm: 'Remove the last order?', refresh },
        ],
      },
      {
        type: 'tabs',
        state: 'tab',
        tabs: [
          {
            title: 'Orders',
            layout: {
              type: 'split',
              size: 0.6,
              primary: {
                type: 'table',
                source: 'orders',
                key: 'id',
                select: 'selected',
                sort: { field: 'id', dir: 'desc' },
                filters: [
                  { field: 'customer', state: 'customer' },
                  { field: 'status', state: 'status' },
                ],
                columns: [
                  { field: 'id', title: 'Order', width: 70 },
                  { field: 'customer' },
                  { field: 'total', format: 'number', align: 'end', width: 80 },
                  { field: 'status', width: 80 },
                ],
                height: 220,
                empty: 'No orders match',
              },
              secondary: {
                type: 'stack',
                children: [
                  { type: 'badge', source: 'order', params: { id: { state: 'selected' } }, field: 'status', tones: { new: 'info', paid: 'success', shipped: 'muted' } },
                  {
                    type: 'detail',
                    source: 'order',
                    params: { id: { state: 'selected' } },
                    sections: ['customer', { field: 'total', format: 'number' }, 'status', { field: 'history', title: 'Status history' }],
                    actions: [{ type: 'button', label: 'Advance this order', command: 'advanceOrder', args: { id: { state: 'selected' } }, refresh }],
                    empty: 'Select an order in the table',
                  },
                ],
              },
            },
          },
          { title: 'Chart', layout: { type: 'chart', kind: 'bar', source: 'orders', itemX: 'id', series: 'total', format: 'number', label: 'Total per order', tone: 'accent' } },
          {
            title: 'Activity',
            layout: {
              type: 'stack',
              children: [
                { type: 'timeline', title: 'Changes', source: 'activity', itemTime: 'at', itemDuration: 'took', itemTitle: 'what', itemLane: 'what', select: 'change', window: 60_000 },
                { type: 'log', title: 'Log', source: 'activity', itemTime: 'at', itemTitle: 'what', itemLevel: 'count', height: 160 },
              ],
            },
          },
          { title: 'Raw', layout: { type: 'code', source: 'orders', language: 'json', title: 'orders.list' } },
        ],
      },
      { type: 'text', title: 'Newest customer', source: 'summary', field: 'newest', empty: 'No orders' },
    ],
  },
  lanes: [{ id: 'changes', label: 'Order changes', tone: 'warning', event: 'changed', itemDuration: 'took', itemTitle: 'what' }],
};

const devtools = registerDevtools('orders', {
  describe: () => ({ orders: orders.list.length, revenue: revenue.value }),
  sources: {
    orders: { read: () => orders.list, key: 'id', events: { changed: 'refresh' } },
    order: {
      read: (params: { id?: number }) => {
        const order = orders.list.find((o) => o.id === params.id);
        return order === undefined ? null : { ...order, history: [{ step: 'created', status: 'new' }, ...(order.status !== 'new' ? [{ step: 'paid', status: 'paid' }] : []), ...(order.status === 'shipped' ? [{ step: 'shipped', status: 'shipped' }] : [])] };
      },
      events: { changed: 'refresh' },
    },
    summary: { read: () => ({ count: orders.list.length, revenue: revenue.value, newest: orders.list.at(-1)?.customer ?? null }), events: { changed: 'refresh' } },
    activity: { read: () => activity, events: { changed: 'append' }, max: 200 },
  },
  commands: {
    add: () => addOrder(),
    advance: () => advanceFirstOrder(),
    advanceOrder: (args: { id?: number }) => {
      if (typeof args.id === 'number') advanceOrder(args.id);
    },
    removeLast: () => removeLastOrder(),
  },
  panels: [panel],
});

// The Dashboard changes the orders too; the panel learns of it like of any other change. Each change is one
// line of the activity the panel shows in time, and one mark on the Performance timeline.
let previous = -1;
effect(() => {
  const count = orders.list.length;
  const statuses = orders.list.map((order) => order.status).join();
  void statuses;
  const what = previous < 0 ? 'orders loaded' : count > previous ? 'order added' : count < previous ? 'order removed' : 'order advanced';
  previous = count;
  const change: Change = { at: Date.now(), what, count, took: 0 };
  activity.push(change);
  if (activity.length > 200) activity.shift();
  devtools.emit('changed', change);
});
