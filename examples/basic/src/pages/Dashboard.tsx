import { Component, FromService, RouterLink } from '@motifx/core';
import { Hint, PageHead } from '../layout';
import { PriceFormatter } from '../services';
import { addOrder, advanceFirstOrder, orders, removeLastOrder, revenue, type Order } from '../stores';

function StatCard(props: { label: string; value: () => string }) {
  return (
    <article class="stat">
      <small>{props.label}</small>
      <b>{() => props.value()}</b>
    </article>
  );
}

function OrderRow(props: { order: Order }) {
  const { order } = props;
  const prices = FromService(PriceFormatter)!;
  return (
    <tr>
      <td>
        <RouterLink to={`/orders/${order.id}`} text={`#${order.id}`} />
      </td>
      <td>{order.customer}</td>
      <td>{() => prices.format(order.total)}</td>
      <td>
        <span class={() => `status ${order.status}`}>{() => order.status}</span>
      </td>
    </tr>
  );
}

export class Dashboard extends Component<HTMLElement> {
  static override elementTag = 'section';
  prices = FromService(PriceFormatter)!;

  override view() {
    const format = (value: number) => this.prices.format(value);
    return (
      <>
        <PageHead
          title="Dashboard"
          text="Orders come from a module store. This page is kept alive: when you leave, it stays in memory and comes back as it was."
        />
        <div class="stats">
          <StatCard label="Revenue" value={() => format(revenue.value)} />
          <StatCard label="Orders" value={() => String(orders.list.length)} />
          <StatCard label="Waiting to ship" value={() => String(orders.list.filter((o) => o.status !== 'shipped').length)} />
        </div>
        <div class="toolbar">
          <button type="button" class="primary" onclick={() => addOrder()}>
            Add order
          </button>
          <button type="button" onclick={() => advanceFirstOrder()}>
            Advance first open order
          </button>
          <button type="button" onclick={() => removeLastOrder()}>
            Remove last order
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.list.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </tbody>
        </table>
        <Hint
          screens="Stores, Reactivity, Elements, Performance"
          points={[
            'Stores: "orders" and "revenue" are listed with their file, src/stores.ts. "Advance first open order" changes a field you can watch there.',
            'Reactivity: every button above is one flush. Its triggers name the store and field that changed, such as orders.list.',
            'Elements: the table body holds a List with its ListItems; each OrderRow is a function component.',
            'Performance: "Add order" builds a row and "Remove last order" disposes one; both show on the timeline.',
            'Leave this page: Performance counts its components under "Not in the tree" because keepAlive keeps them.',
          ]}
        />
      </>
    );
  }
}
