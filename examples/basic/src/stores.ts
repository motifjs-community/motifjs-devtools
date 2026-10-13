import { createComputed, reactive } from '@motifx/core';

export type OrderStatus = 'new' | 'paid' | 'shipped';
export type Order = { id: number; customer: string; total: number; status: OrderStatus };

export const orders = reactive({
  list: [
    { id: 1042, customer: 'Ada', total: 120, status: 'paid' },
    { id: 1043, customer: 'Linus', total: 64, status: 'new' },
    { id: 1044, customer: 'Grace', total: 210, status: 'shipped' },
  ] as Order[],
});

export const revenue = createComputed(() => orders.list.reduce((sum, order) => sum + order.total, 0));

export const session = reactive({ signedIn: false, unsaved: false });

const CUSTOMERS = ['Alan', 'Barbara', 'Dennis', 'Edsger', 'Frances', 'Ken', 'Margaret', 'Tim'];

export function addOrder() {
  const last = orders.list[orders.list.length - 1];
  const id = (last?.id ?? 1041) + 1;
  orders.list.push({ id, customer: CUSTOMERS[id % CUSTOMERS.length], total: 20 + ((id * 37) % 180), status: 'new' });
}

export function advanceFirstOrder() {
  const order = orders.list.find((o) => o.status !== 'shipped');
  if (order) order.status = order.status === 'new' ? 'paid' : 'shipped';
}

export function removeLastOrder() {
  orders.list.pop();
}
