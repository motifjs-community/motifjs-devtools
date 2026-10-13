import { Component, FromService } from '@motifx/core';
import { Hint, PageHead } from '../layout';
import { CartService, PriceFormatter, type CartItem } from '../services';
import { toast } from '../toasts';

const PRODUCTS = [
  { name: 'Coffee', price: 9 },
  { name: 'Cake', price: 12 },
  { name: 'Tea', price: 6 },
];

function CartLine(props: { item: CartItem }) {
  const { item } = props;
  const cart = FromService(CartService)!;
  const prices = FromService(PriceFormatter)!;
  const format = (value: number) => prices.format(value);
  return (
    <tr>
      <td>{item.name}</td>
      <td>{() => format(item.price)}</td>
      <td>
        <div class="stepper">
          <button type="button" onclick={() => cart.change(item.id, -1)}>
            −
          </button>
          <b>{() => String(item.qty)}</b>
          <button type="button" onclick={() => cart.change(item.id, 1)}>
            +
          </button>
        </div>
      </td>
      <td>{() => format(item.price * item.qty)}</td>
    </tr>
  );
}

export class CartPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  cart = FromService(CartService)!;
  prices = FromService(PriceFormatter)!;

  add(name: string, price: number) {
    this.cart.add(name, price);
    toast(`${name} added to the cart`);
  }

  override view() {
    const cart = this.cart;
    const format = (value: number) => this.prices.format(value);
    return (
      <>
        <PageHead title="Cart" text="The cart lives in CartService, a singleton: it keeps its items while you move between pages." />
        <div class="toolbar">
          {PRODUCTS.map((product) => (
            <button key={product.name} type="button" onclick={() => this.add(product.name, product.price)}>
              {`Add ${product.name}`}
            </button>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {cart.state.items.map((item) => (
              <CartLine key={item.id} item={item} />
            ))}
          </tbody>
        </table>
        {cart.state.items.length === 0 && <p class="muted">The cart is empty. Add something above.</p>}
        <p class="total">{() => `Total ${format(cart.total.value)} · ${cart.count.value} items`}</p>
        <Hint
          screens="Services, Stores, Elements"
          points={[
            'Services: the root scope holds CartService. Open it to see state.items, total and count; they change as you click.',
            'Stores: CartService.state is a reactive store, CartService.total and CartService.count are computeds. Edit a quantity there and the page follows.',
            'Elements: the empty message is a When condition; it is built when the cart empties and disposed when you add again.',
            'Adding an item shows a toast. Select the ToastHost in Elements: its Extensions tab shows what the toasts package reports.',
          ]}
        />
      </>
    );
  }
}
