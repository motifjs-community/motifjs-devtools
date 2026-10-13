import { FromService, RouterLink, useNavigation } from '@motifx/core';
import { Hint, PageHead } from '../layout';
import { OrderDraft, PriceFormatter } from '../services';
import { orders } from '../stores';

const draftText = (draft: OrderDraft) => `OrderDraft #${draft.number}, created at ${draft.createdAt} for this navigation`;

export function OrderPage() {
  const nav = useNavigation();
  const draft = FromService(OrderDraft)!;
  const prices = FromService(PriceFormatter)!;
  const id = Number(nav.params.id);
  const order = () => orders.list.find((o) => o.id === id);
  return (
    <section>
      <PageHead title={`Order #${id}`} text="The id comes from the route params. Each visit opens a new navigation scope with its own OrderDraft." />
      <div class="card">
        <dl class="facts">
          <dt>Customer</dt>
          <dd>{() => order()?.customer ?? 'Not in the list'}</dd>
          <dt>Total</dt>
          <dd>{() => prices.format(order()?.total ?? 0)}</dd>
          <dt>Status</dt>
          <dd>{() => order()?.status ?? '–'}</dd>
        </dl>
      </div>
      <div class="card">
        <h2>Draft</h2>
        <p class="muted">{draftText(draft)}</p>
        <div class="toolbar">
          <button type="button" onclick={() => (draft.state.quantity = Math.max(1, draft.state.quantity - 1))}>
            −
          </button>
          <b>{() => `Quantity ${draft.state.quantity}`}</b>
          <button type="button" onclick={() => draft.state.quantity++}>
            +
          </button>
        </div>
        <label class="field">
          Note
          <input value={() => draft.state.note} oninput={(e) => (draft.state.note = (e.target as HTMLInputElement).value)} placeholder="Type to change the service" />
        </label>
      </div>
      <div class="toolbar">
        <RouterLink to={`/orders/${id - 1}`} text="← Previous order" />
        <RouterLink to={`/orders/${id + 1}`} text="Next order →" />
      </div>
      <Hint
        screens="Router, Services"
        points={[
          'Router: the current route shows the param id; every visit is in Recent navigations with its duration.',
          'Services: the current navigation scope holds OrderDraft. Change the quantity or the note and its fields follow live.',
          'Go to the next order: a new scope and a new OrderDraft are created and the previous one is disposed, see Activity.',
          'PriceFormatter is transient: every component that asks for it gets a new instance.',
        ]}
      />
    </section>
  );
}
