import { effect } from '@motifx/core';
import { registerDevtools } from '@motifx/core/devtools';
import type { PanelMetadata } from '@motifx-community/devtools';
import { addOrder, advanceFirstOrder, orders, removeLastOrder, revenue } from './stores';

// The shop's orders as a package would show them: the store as it is, two counters, three commands.
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
          { type: 'button', label: 'Add order', icon: 'play', command: 'add', refresh: ['orders', 'summary'] },
          { type: 'button', label: 'Advance first', command: 'advance', refresh: ['orders', 'summary'] },
          { type: 'button', label: 'Remove last', icon: 'trash', tone: 'danger', command: 'removeLast', confirm: 'Remove the last order?', refresh: ['orders', 'summary'] },
        ],
      },
      { type: 'text', title: 'Newest customer', source: 'summary', field: 'newest', empty: 'No orders' },
      { type: 'json', title: 'Orders as the store holds them', source: 'orders', empty: 'No orders' },
    ],
  },
};

const devtools = registerDevtools('orders', {
  describe: () => ({ orders: orders.list.length, revenue: revenue.value }),
  sources: {
    orders: { read: () => orders.list, key: 'id', events: { changed: 'refresh' } },
    summary: { read: () => ({ count: orders.list.length, revenue: revenue.value, newest: orders.list.at(-1)?.customer ?? null }), events: { changed: 'refresh' } },
  },
  commands: {
    add: () => addOrder(),
    advance: () => advanceFirstOrder(),
    removeLast: () => removeLastOrder(),
  },
  panels: [panel],
});

// The Dashboard changes the orders too; the panel learns of it like of any other change.
effect(() => {
  for (const order of orders.list) void order.status, void order.total;
  devtools.emit('changed', { count: orders.list.length });
});
