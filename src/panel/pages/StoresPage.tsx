import { Component, FromService } from '@motifx/core';
import { formatClock } from '../format';
import { ICONS } from '../icons';
import { DevtoolsModel } from '../model/DevtoolsModel';
import { StoresModel, displayName, holderName, summaryOf, type StoreHolder, type StoreItem, type StoreTypeFilter } from '../model/StoresModel';
import { EditableValue, PropNode, isEditable } from '../ValueTree';

const TYPES = ['reactive', 'signal', 'computed'] as const;

const releasedText = (shown: boolean, count: number) => (shown ? 'Hide released' : `Show released (${count})`);

const unheldText = (item: StoreItem | undefined) => {
  if (item?.released === true) return 'Not kept by a component or service anymore';
  return item?.file !== undefined ? `Module ${item.file}` : 'Module or closure';
};

function HolderLink(props: { holder: StoreHolder; devtools: DevtoolsModel }) {
  const { holder, devtools } = props;
  if (holder.kind === 'component') {
    return (
      <button type="button" class="dt-link" title="Show in Elements" onclick={() => devtools.reveal([...holder.path])}>
        {holderName(holder)}
      </button>
    );
  }
  return <span class="dt-mono" title={holder.lifetime}>{holderName(holder)}</span>;
}

function StoreEntry(props: { id: number; model: StoresModel; devtools: DevtoolsModel }) {
  const { id, model, devtools } = props;
  const item = () => model.state.stores.find((s) => s.id === id);
  const open = () => model.state.expanded === id;
  const change = () => model.state.changes[id];
  const number = () => String(model.state.stores.findIndex((s) => s.id === id) + 1).padStart(2, '0');
  const node = () => model.state.values[`${id}`];
  const entries = () => {
    const value = node();
    return value !== undefined && 'entries' in value ? value.entries : [];
  };
  const root = () => model.state.roots[id];
  const showRoot = () => entries().length === 0 && isEditable(root());
  const changeText = () => {
    const c = change();
    return c === undefined ? '' : `${[...c.path, c.key].join('.')} at ${formatClock(c.at)}`;
  };
  const source = model.sourceOf(id);
  return (
    <div
      class={() => `dt-store-entry${open() ? ' open' : ''}${change() !== undefined ? ' changed' : ''}${item()?.released === true ? ' released' : ''}`}
      x-display={() => model.shows(item())}
    >
      <button type="button" class="dt-store-row" onclick={() => model.toggle(id)}>
        <span class="dt-mono dt-muted">{() => number()}</span>
        <span class="dt-store-name">
          <b>{() => (item() === undefined ? '' : displayName(item()!))}</b>
          <small>{`#${id}`}</small>
        </span>
        <span class={() => `dt-store-type ${item()?.type ?? ''}`}>{() => item()?.type ?? ''}</span>
        <span class="dt-mono dt-store-summary">{() => summaryOf(item()?.value)}</span>
        <span class="dt-store-stale" x-display={() => item()?.stale === true}>
          stale
        </span>
        <span class="dt-chevron" x-html={ICONS.chevron}></span>
      </button>
      <div class="dt-store-detail" x-display={() => open()}>
        <dl>
          <dt>Held by</dt>
          <dd class="dt-store-holders">
            <span class="dt-muted" x-display={() => (item()?.holders.length ?? 0) === 0}>
              {() => unheldText(item())}
            </span>
            {() => (item()?.holders ?? []).map((holder, index) => <HolderLink key={index} holder={holder} devtools={devtools} />)}
          </dd>
          <dt x-display={() => change() !== undefined}>Last change</dt>
          <dd class="dt-mono dt-store-change" x-display={() => change() !== undefined}>
            {() => changeText()}
          </dd>
        </dl>
        <div class="dt-store-root" x-display={() => showRoot()}>
          {() => [root()].map((value) => <EditableValue key={JSON.stringify(value) ?? ''} value={value} keys={[]} source={source} />)}
        </div>
        <div class="dt-kv">
          {() => entries().map((entry) => <PropNode key={`${entry.key}:${JSON.stringify(entry.value) ?? ''}`} name={entry.key} value={entry.value} getter={entry.getter} keys={[entry.key]} source={source} />)}
        </div>
        <div class="dt-store-error" x-display={() => open() && model.state.error !== ''}>
          {() => model.state.error}
        </div>
      </div>
    </div>
  );
}

export class StoresPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  devtools = FromService(DevtoolsModel)!;
  model = FromService(StoresModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-stores');
  }

  override view() {
    const m = this.model;
    const d = this.devtools;
    const splitText = () => TYPES.map((type) => `${m.liveStores.filter((s) => s.type === type).length} ${type}`).join(' · ');
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>REACTIVE STATE</small>
            <h1>Stores</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.load()}>
              <span class="dt-button-icon" x-html={ICONS.refresh}></span>
              Refresh
            </button>
          </div>
        </header>

        <div class="dt-panel dt-route-card dt-store-card">
          <span class="dt-route-icon" x-html={ICONS.stores}></span>
          <div class="dt-route-main">
            <b class="dt-route-uri dt-store-total">{() => String(m.liveStores.length)}</b>
            <small>Live stores</small>
            <span class="dt-log-split dt-muted">{() => splitText()}</span>
          </div>
          <span class="dt-route-state">Runtime connected</span>
        </div>

        <div class="dt-panel">
          <div class="dt-panel-head">
            <div>
              <b>Stores</b>
              <small>Kept by components, services and modules; click a value to edit it</small>
            </div>
            <label class="dt-filter" title="Filter by type">
              <span x-html={ICONS.filter}></span>
              <select
                aria-label="Filter by type"
                value={() => m.state.filter}
                onchange={(e) => m.setFilter((e.target as HTMLSelectElement).value as StoreTypeFilter)}
              >
                <option value="all">All types</option>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div class="dt-empty small dt-store-empty" x-display={() => m.visibleStores.length === 0}>
            No store recorded yet. Stores created before <code>app.useDevelopment(true)</code> show up when a component or
            service keeps them, or when <code>globalThis.__MOTIF_DEV__ = true</code> is set before the app code.
          </div>
          {m.state.stores.map((item) => (
            <StoreEntry key={item.id} id={item.id} model={m} devtools={d} />
          ))}
          <div class="dt-released" x-display={() => m.releasedCount > 0}>
            <button type="button" class="dt-link dt-released-toggle" onclick={() => m.toggleReleased()}>
              {() => releasedText(m.state.showReleased, m.releasedCount)}
            </button>
            <small class="dt-muted">Released stores leave the list when the browser collects them.</small>
          </div>
        </div>
      </>
    );
  }
}
