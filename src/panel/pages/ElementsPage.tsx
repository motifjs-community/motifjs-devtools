import { Component, FromService } from '@motifx/core';
import { formatPath } from '../format';
import { DevtoolsModel } from '../model/DevtoolsModel';
import { ElementsModel, type Row } from '../model/ElementsModel';
import { PropNode, Value } from '../ValueTree';

const visibilityGlyph = (visible: boolean | undefined) => (visible ? '◉' : '○');
const activeText = (active: boolean | null) => (active === false ? 'inactive' : 'active');
const eventKind = (dom: boolean) => (dom ? 'dom' : 'component');

const isGetter = (value: unknown) => typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'getter';

const FRAMEWORK_PROPS = new Set(['indexkey', 'runover', 'childs', 'initializeComponent', 'oninitializeComponent', 'key', 'ref', 'options', 'transition']);

function TreeRow(props: { row: Row; model: ElementsModel }) {
  const { row, model } = props;
  return (
    <div
      class={() => `dt-row${model.state.selected === row.key ? ' selected' : ''}${row.named ? ' named' : ''}${row.connected ? '' : ' detached'}`}
      style={() => `--depth: ${row.depth}`}
      onclick={() => model.select(row)}
      onmouseenter={() => model.hover(row)}
    >
      <button
        type="button"
        class={() => (row.hasChildren ? (row.expanded ? 'dt-caret open' : 'dt-caret') : 'dt-caret leaf')}
        aria-label={() => (row.expanded ? 'Collapse' : 'Expand')}
        onclick:stop={() => model.toggle(row)}
      ></button>
      <span class="dt-glyph" x-display={() => row.named}></span>
      <span class="dt-type" x-display={() => row.named}>{() => row.type}</span>
      <span class="dt-tag">{() => `<${row.tag}>`}</span>
      <span class="dt-fill"></span>
      <span class="dt-flag waiting" x-display={() => row.waiting}>WAITING</span>
      <span class="dt-flag hidden" x-display={() => !row.visible && !row.waiting}>HIDDEN</span>
      <span class={() => (row.connected ? 'dt-dot ok' : 'dt-dot')} title={() => (row.connected ? 'In the document' : 'Not in the document')}></span>
    </div>
  );
}

function Section(props: { title: string; count: () => number }) {
  return (
    <summary>
      <span>{props.title}</span>
      <span class="dt-count">{() => props.count()}</span>
    </summary>
  );
}

class Inspector extends Component<HTMLElement> {
  static override elementTag = 'aside';
  declare props: { model: ElementsModel };

  override onConfigured() {
    this.class.add('dt-inspector');
  }

  override view() {
    const m = this.props.model;
    const data = () => m.state.inspection;
    const props = () => Object.entries(data()?.functionProps ?? data()?.props ?? {}).filter(([key]) => !FRAMEWORK_PROPS.has(key));
    const fields = () => Object.entries(data()?.fields ?? {});
    const classes = () => [...(data()?.classes.static ?? []), ...(data()?.classes.reactive ?? []).flatMap((r) => r.classes)];
    return (
      <>
        <div class="dt-empty small" x-display={() => data() === null}>Select a component in the tree.</div>
        <div class="dt-inspect" x-display={() => data() !== null}>
          <header class="dt-inspect-head">
            <small>INSPECTING</small>
            <div class="dt-inspect-title">
              <b>{() => data()?.type || `<${data()?.tag ?? ''}>`}</b>
              <code class="dt-chip">{() => formatPath(data()?.path ?? null)}</code>
              <span class="dt-fill"></span>
              <button
                type="button"
                class="dt-icon-button"
                title={() => (data()?.visible ? 'Hide' : 'Show')}
                aria-label="Toggle visibility"
                onclick={() => m.setVisible(!data()?.visible)}
              >
                {() => visibilityGlyph(data()?.visible)}
              </button>
            </div>
            <nav class="dt-tabs">
              <button type="button" class={() => (m.state.tab === 'details' ? 'active' : '')} onclick={() => m.setTab('details')}>
                Details
              </button>
              <button type="button" class={() => (m.state.tab === 'effects' ? 'active' : '')} onclick={() => m.setTab('effects')}>
                {() => `Effects ${data()?.effects.length ?? 0}`}
              </button>
              <button type="button" class={() => (m.state.tab === 'extensions' ? 'active' : '')} onclick={() => m.setTab('extensions')}>
                Extensions
              </button>
            </nav>
          </header>

          <div class="dt-inspect-body" x-display={() => m.state.tab === 'details'}>
            <details open>
              <Section title="Props" count={() => props().length} />
              <div class="dt-kv">
                {props().map(([key, value]) => (
                  <PropNode key={key} name={key} value={value} keys={[key]} source={m.propsSource} />
                ))}
              </div>
            </details>
            <details open>
              <Section title="Fields" count={() => fields().length} />
              <div class="dt-kv dt-fields">
                {fields().map(([key, value]) => (
                  <PropNode key={key} name={key} value={value} getter={isGetter(value)} keys={[key]} source={m.fieldsSource} />
                ))}
              </div>
            </details>
            <details open>
              <Section title="Bindings" count={() => data()?.bindings.length ?? 0} />
              <ul class="dt-list">
                {(data()?.bindings ?? []).map((binding, index) => (
                  <li key={index}>
                    <span class="dt-pill">{binding.kind}</span>
                    <span>{() => binding.property ?? (typeof binding.member === 'string' ? binding.member : '')}</span>
                    <span class="dt-fill"></span>
                    <span class={binding.active === false ? 'dt-state' : 'dt-state ok'}>{() => activeText(binding.active)}</span>
                  </li>
                ))}
              </ul>
            </details>
            <details open>
              <Section title="Classes" count={() => classes().length} />
              <div class="dt-chips">
                {classes().map((name) => (
                  <button key={name} type="button" class="dt-chip removable" title={`Remove ${name}`} onclick={() => m.setClass(name, false)}>
                    {name}
                  </button>
                ))}
              </div>
              <form
                class="dt-add"
                onsubmit={(sender, e) => {
                  e.preventDefault();
                  const input = (sender.element as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
                  void m.setClass(input.value, true);
                  input.value = '';
                }}
              >
                <input name="name" placeholder="Add class…" autocomplete="off" />
              </form>
            </details>
            <details>
              <Section title="Attributes" count={() => data()?.attributes.length ?? 0} />
              <ul class="dt-list">
                {(data()?.attributes ?? []).map((attribute, index) => (
                  <li key={index}>
                    <span>{String(attribute.name ?? attribute.key ?? '')}</span>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <Section title="Events" count={() => data()?.events.length ?? 0} />
              <ul class="dt-list">
                {(data()?.events ?? []).map((event, index) => (
                  <li key={index}>
                    <span class="dt-pill">{() => eventKind(event.dom)}</span>
                    <span>{event.name}</span>
                    <span class="dt-fill"></span>
                    <Value value={event.handler} />
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <Section title="Hooks" count={() => data()?.hooks.length ?? 0} />
              <ul class="dt-list">
                {(data()?.hooks ?? []).map((hook) => (
                  <li key={hook.name}>
                    <span>{hook.name}</span>
                    <span class="dt-fill"></span>
                    <span class="dt-muted">{`${hook.method ? 'method' : ''}${hook.method && hook.handlers ? ' + ' : ''}${hook.handlers ? `${hook.handlers} handler` : ''}`}</span>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <Section title="Services" count={() => data()?.services?.requested.length ?? 0} />
              <ul class="dt-list">
                <li>
                  <span class="dt-muted">scope</span>
                  <span>{() => data()?.services?.scope?.kind ?? '–'}</span>
                </li>
                {(data()?.services?.requested ?? []).map((token) => (
                  <li key={token}>
                    <span>{token}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div class="dt-inspect-body" x-display={() => m.state.tab === 'effects'}>
            <ul class="dt-list">
              {(data()?.effects ?? []).map((effect, index) => (
                <li key={index}>
                  <span class="dt-pill">{effect.kind}</span>
                  <span>{`${effect.runs} runs`}</span>
                  <span class="dt-fill"></span>
                  <span class="dt-muted">{`${effect.lastDuration.toFixed(2)} ms`}</span>
                </li>
              ))}
            </ul>
          </div>

          <div class="dt-inspect-body" x-display={() => m.state.tab === 'extensions'}>
            <pre class="dt-pre">{() => JSON.stringify(data()?.extensions ?? {}, null, 2)}</pre>
          </div>
        </div>
      </>
    );
  }
}

export class ElementsPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  devtools = FromService(DevtoolsModel)!;
  model = new ElementsModel(this.devtools.client);

  override onConfigured() {
    this.class.add('dt-elements');
    this.motif.setDisposable(() => this.model.dispose());
    this.motif.setDisposable(this.devtools.onReveal((path) => void this.model.reveal(path)));
    this.bindings.watch(() => {
      if (this.model.state.revealed === 0) return;
      requestAnimationFrame(() => (this.element as HTMLElement).querySelector('.dt-row.selected')?.scrollIntoView({ block: 'nearest' }));
    });
  }

  override view() {
    const m = this.model;
    return (
      <>
        <div class="dt-tree-pane">
          <div class="dt-toolbar">
            <input
              class="dt-search"
              type="search"
              placeholder="Find component…"
              value={() => m.state.query}
              oninput={(e) => m.setQuery((e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class={() => (m.state.hidePlain ? 'dt-icon-button active' : 'dt-icon-button')}
              title={() => (m.state.hidePlain ? 'Show plain elements' : 'Show named components only')}
              aria-label="Toggle plain elements"
              onclick={() => m.setHidePlain(!m.state.hidePlain)}
            >
              ⛉
            </button>
            <button type="button" class="dt-icon-button" title="Reload tree" aria-label="Reload tree" onclick={() => m.loadTree()}>
              ⟳
            </button>
          </div>
          <div class="dt-tree-head">
            <span>COMPONENT TREE</span>
            <span>{() => `${m.state.rows.length} / ${m.state.total} NODES`}</span>
          </div>
          <div class="dt-tree" role="tree" onmouseleave={() => m.hover(null)}>
            {m.state.rows.map((row) => (
              <TreeRow key={row.key} row={row} model={m} />
            ))}
          </div>
          <footer class="dt-tree-foot">
            <span>
              <i class="dt-dot ok"></i> {() => `${m.state.connected} connected`}
            </span>
            <span>{() => `${m.state.detached} detached`}</span>
            <span class="dt-error" x-display={() => m.state.error !== null}>{() => m.state.error ?? ''}</span>
          </footer>
        </div>
        <Inspector model={m} />
      </>
    );
  }
}
