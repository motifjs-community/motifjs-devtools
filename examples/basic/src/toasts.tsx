import { Component, reactive } from '@motifx/core';
import { registerDevtools } from '@motifx/core/devtools';

type Toast = { id: number; text: string };

const toasts = reactive({ list: [] as Toast[] });
let shown = 0;

export class ToastHost extends Component<HTMLElement> {
  static override elementTag = 'aside';

  override onConfigured() {
    this.class.add('toasts');
  }

  override view() {
    return (
      <>
        {toasts.list.map((toast) => (
          <div key={toast.id} class="toast">
            {toast.text}
          </div>
        ))}
      </>
    );
  }
}

const devtools = registerDevtools('toasts', {
  describe: () => ({ visible: toasts.list.length, shown }),
  inspect: (component) => (component instanceof ToastHost ? { visible: toasts.list.map((t) => t.text), shown } : undefined),
});

export function toast(text: string) {
  const id = ++shown;
  toasts.list.push({ id, text });
  devtools.emit('shown', { id, text });
  setTimeout(() => {
    const index = toasts.list.findIndex((t) => t.id === id);
    if (index >= 0) toasts.list.splice(index, 1);
  }, 3000);
}
