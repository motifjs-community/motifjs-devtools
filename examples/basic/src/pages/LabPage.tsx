import { Component, FromService, reactive, useApplication, type AppWindow, type ComponentBase, type ServiceProvider } from '@motifx/core';
import { Hint, PageHead } from '../layout';
import { CartService, DialogState, PriceFormatter } from '../services';
import { toast } from '../toasts';

type Status = 'idle' | 'loading' | 'done' | 'failed';
type Row = { id: number; value: number };

const STATUSES: Status[] = ['idle', 'loading', 'done', 'failed'];

function Panel() {
  return <div class="card inset">This panel is built the first time it is shown and kept while hidden.</div>;
}

function CartSummary() {
  const cart = FromService(CartService)!;
  const prices = FromService(PriceFormatter)!;
  return (
    <div class="card inset">
      <b>Cart</b>
      <p class="muted">{() => `${cart.count.value} items · ${prices.format(cart.total.value)}`}</p>
      <button type="button" onclick={() => cart.add('Tea', 6)}>
        Add a tea
      </button>
    </div>
  );
}

const scopeText = (scope: string | null) => (scope === null ? 'No scope is open.' : scope);

export class LabPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  state = reactive({ panel: false, loading: false, details: false, status: 'idle' as Status, dupes: [] as number[], scope: null as string | null });
  rows = reactive({ items: [] as Row[] });
  private scope: ServiceProvider | null = null;
  private summary: ComponentBase | null = null;
  private frame: HTMLIFrameElement | null = null;
  private framed: AppWindow | null = null;

  buildRows(count: number) {
    this.rows.items = Array.from({ length: count }, (_, i) => ({ id: i + 1, value: Math.round(Math.random() * 1000) }));
  }

  shuffle() {
    for (const row of this.rows.items) row.value = Math.round(Math.random() * 1000);
  }

  openScope() {
    if (this.scope !== null) return;
    this.scope = useApplication().services.createScope('dialog');
    const dialog = this.scope.get(DialogState) as DialogState;
    this.scope.get(PriceFormatter);
    this.state.scope = `Scope "dialog" is open with ${dialog.state.title}.`;
  }

  closeScope() {
    this.scope?.dispose();
    this.scope = null;
    this.state.scope = null;
  }

  popOut() {
    if (this.summary === null) return;
    this.context.windows
      .open(this.summary, { width: 420, height: 260, title: 'Cart summary', owner: this })
      .catch(() => toast('The browser did not open the window'));
  }

  moveToFrame() {
    const target = this.frame?.contentWindow;
    if (this.summary === null || !target) return;
    this.framed ??= this.context.windows.attach(target, { title: 'Embedded cart', closeWhenEmpty: false, owner: this });
    this.framed.add(this.summary);
  }

  bringBack() {
    if (this.summary === null) return;
    this.context.windows.of(this.summary)?.release(this.summary);
  }

  fail() {
    throw new Error('The click handler of "Throw an error" failed on purpose');
  }

  override onDisposed() {
    this.closeScope();
  }

  override view() {
    const s = this.state;
    return (
      <>
        <PageHead title="Lab" text="Small experiments for the rest of the panel: conditions, a large list, a scope of your own, a warning and an error." />

        <div class="card">
          <h2>Conditions</h2>
          <div class="toolbar">
            <button type="button" onclick={() => (s.panel = !s.panel)}>
              Toggle x-wait panel
            </button>
            <button type="button" onclick={() => (s.loading = !s.loading)}>
              Toggle ternary
            </button>
            <button type="button" onclick={() => (s.details = !s.details)}>
              Toggle && details
            </button>
          </div>
          <Panel x-wait={() => !s.panel} />
          {s.loading ? <p class="muted">Loading… (the first branch of a ternary)</p> : <p class="muted">Ready. (the second branch of a ternary)</p>}
          {s.details && <p class="muted">These details are built when shown and disposed when hidden.</p>}
          <div class="toolbar">
            {STATUSES.map((status) => (
              <button key={status} type="button" class={() => (s.status === status ? 'active' : '')} onclick={() => (s.status = status)}>
                {status}
              </button>
            ))}
          </div>
          {() => {
            switch (s.status) {
              case 'loading':
                return <p>Switch: loading</p>;
              case 'done':
                return <p>Switch: done</p>;
              case 'failed':
                return <p>Switch: failed</p>;
              default:
                return <p>Switch: idle</p>;
            }
          }}
        </div>

        <div class="card">
          <h2>A large list</h2>
          <div class="toolbar">
            <button type="button" class="primary" onclick={() => this.buildRows(1000)}>
              Build 1,000 rows
            </button>
            <button type="button" onclick={() => this.shuffle()}>
              Change every value
            </button>
            <button type="button" onclick={() => this.buildRows(0)}>
              Clear
            </button>
          </div>
          <div class="rows">
            {this.rows.items.map((row) => (
              <div key={row.id} class="row">
                <span>{`Row ${row.id}`}</span>
                <b>{() => String(row.value)}</b>
              </div>
            ))}
          </div>
        </div>

        <div class="card">
          <h2>A scope of your own</h2>
          <p class="muted">{() => scopeText(s.scope)}</p>
          <div class="toolbar">
            <button type="button" onclick={() => this.openScope()}>
              Open a scope
            </button>
            <button type="button" onclick={() => this.closeScope()}>
              Close it
            </button>
          </div>
        </div>

        <div class="card">
          <h2>Windows</h2>
          <p class="muted">The cart summary moves into a popup or into the iframe below and keeps its state; closing the window brings it back.</p>
          <div class="toolbar">
            <button type="button" onclick={() => this.popOut()}>
              Open in a window
            </button>
            <button type="button" onclick={() => this.moveToFrame()}>
              Move into the iframe
            </button>
            <button type="button" onclick={() => this.bringBack()}>
              Bring it back
            </button>
          </div>
          <CartSummary ref={(c) => (this.summary = c)} />
          <iframe class="frame" title="Embedded cart" ref={(c) => (this.frame = c.element as HTMLIFrameElement)} />
        </div>

        <div class="card">
          <h2>Logs</h2>
          <div class="toolbar">
            <button type="button" onclick={() => (s.dupes = [7, 7])}>
              Render duplicate keys (warning)
            </button>
            <button type="button" onclick={() => this.fail()}>
              Throw an error
            </button>
            <button type="button" onclick={() => toast('Hello from the Lab')}>
              Show a toast
            </button>
          </div>
          <ul class="dupes">
            {s.dupes.map((n) => (
              <li key={n}>{`Item ${n}`}</li>
            ))}
          </ul>
        </div>

        <Hint
          screens="Elements, Performance, Reactivity, Services, Logs"
          points={[
            'Elements: the x-wait panel shows WAITING until you open it; the ternary, the && details and the switch are named Ternary, When and Switch.',
            'Elements: "Open in a window" and "Move into the iframe" list that window as a root of its own with the cart summary under it, marked with the name of its document; the iframe row is named "Embedded cart".',
            'Performance: "Build 1,000 rows" is one Build bar on the timeline; open it to see the rows by type. "Clear" is one Dispose bar.',
            'Reactivity: "Change every value" is a single flush that runs a thousand effects.',
            'Services: "Open a scope" adds a "dialog" scope under the root with DialogState and a transient PriceFormatter; "Close it" disposes them.',
            'Logs: the duplicate keys raise warning MJX202 and "Throw an error" reports MJX123 with the original error as its cause.',
          ]}
        />
      </>
    );
  }
}
