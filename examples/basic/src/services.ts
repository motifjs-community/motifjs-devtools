import { createComputed, createSignal, effect, reactive } from '@motifx/core';

export type Theme = 'light' | 'dark';

export class ThemeService {
  theme = createSignal<Theme>('light');

  constructor() {
    effect(() => {
      document.documentElement.dataset.theme = this.theme.value;
    });
  }

  toggle() {
    this.theme.value = this.theme.value === 'light' ? 'dark' : 'light';
  }
}

export type CartItem = { id: number; name: string; price: number; qty: number };

export class CartService {
  state = reactive({
    items: [
      { id: 1, name: 'Tea', price: 6, qty: 2 },
      { id: 2, name: 'Biscuits', price: 4, qty: 1 },
    ] as CartItem[],
  });

  total = createComputed(() => this.state.items.reduce((sum, item) => sum + item.price * item.qty, 0));
  count = createComputed(() => this.state.items.reduce((sum, item) => sum + item.qty, 0));

  add(name: string, price: number) {
    const item = this.state.items.find((i) => i.name === name);
    if (item) item.qty++;
    else this.state.items.push({ id: Date.now(), name, price, qty: 1 });
  }

  change(id: number, delta: number) {
    const index = this.state.items.findIndex((i) => i.id === id);
    if (index < 0) return;
    const item = this.state.items[index];
    item.qty += delta;
    if (item.qty <= 0) this.state.items.splice(index, 1);
  }
}

let drafts = 0;

export class OrderDraft {
  readonly number = ++drafts;
  readonly createdAt = new Date().toLocaleTimeString('en-GB');
  state = reactive({ quantity: 1, note: '' });
}

export class PriceFormatter {
  format(value: number) {
    return `$${value.toFixed(2)}`;
  }
}

let dialogs = 0;

export class DialogState {
  readonly number = ++dialogs;
  state = reactive({ open: true, title: `Dialog ${this.number}` });
}

export class ApiClient {
  baseUrl = '/api';
}
