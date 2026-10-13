import { Component, FromService } from '@motifx/core';
import { formatClock, formatValue } from '../format';
import { ICONS } from '../icons';
import { LIFETIMES, ServicesModel, scopeLabel, scopeName, scopeTag, type Activity, type LifetimeFilter, type ScopeRow } from '../model/ServicesModel';
import { PropNode } from '../ValueTree';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function ScopeRowView(props: { row: ScopeRow; model: ServicesModel }) {
  const { row, model } = props;
  const scope = () => model.scope(row.id);
  const selected = () => model.state.selected === row.id;
  const count = () => (scope()?.services.filter((s) => s.creating !== true).length ?? 0) + (scope()?.transients.length ?? 0);
  const tag = () => scopeTag(scope());
  return (
    <button
      type="button"
      class={() => `dt-scope-row${selected() ? ' selected' : ''}${scope()?.current ? ' current' : ''}`}
      style={`--level: ${row.depth}`}
      onclick={() => model.select(row.id)}
    >
      <span class="dt-scope-name">
        <b>{() => scopeName(scope())}</b>
        <small>{`#${row.id}`}</small>
      </span>
      <span class={() => `dt-scope-tag ${tag().split(' ')[0]}`} x-display={() => tag() !== ''}>
        {() => tag()}
      </span>
      <span class="dt-mono dt-muted dt-scope-count">{() => String(count())}</span>
    </button>
  );
}

function ServiceSlotView(props: { scope: number; token: string; model: ServicesModel }) {
  const { scope, token, model } = props;
  const slot = () => model.slots(scope).find((s) => s.token === token);
  const open = () => model.state.expanded === model.slotKey(scope, token);
  const node = () => model.node(scope, token);
  const entries = () => {
    const value = node();
    return value !== undefined && 'entries' in value ? value.entries : [];
  };
  const error = () => {
    const value = node();
    return value !== undefined && 'error' in value ? value.error : '';
  };
  const summary = () => {
    const s = slot();
    if (s === undefined) return '';
    if (s.creating) return 'creating…';
    if (!s.created) return 'not created';
    return formatValue(s.instance).text;
  };
  const expandable = () => slot()?.created === true && formatValue(slot()?.instance).kind === 'object';
  const source = model.sourceOf(scope, token);
  return (
    <div class={() => `dt-service-entry${open() ? ' open' : ''}${slot()?.created ? '' : ' idle'}`}>
      <button
        type="button"
        class="dt-service-row"
        onclick={() => {
          if (expandable()) void model.toggle(scope, token);
        }}
      >
        <span class={() => (slot()?.created ? 'dt-service-dot active' : 'dt-service-dot')}></span>
        <b class="dt-service-token">{token}</b>
        <span class={() => `dt-lifetime ${slot()?.lifetime ?? ''}`}>{() => slot()?.lifetime ?? ''}</span>
        <span class="dt-mono dt-service-summary">{() => summary()}</span>
        <span class="dt-chevron" x-display={() => expandable()} x-html={ICONS.chevron}></span>
      </button>
      <div class="dt-service-detail" x-display={() => open()}>
        <div class="dt-kv">
          {() => entries().map((entry) => <PropNode key={`${entry.key}:${JSON.stringify(entry.value) ?? ''}`} name={entry.key} value={entry.value} getter={entry.getter} keys={[entry.key]} source={source} />)}
        </div>
        <div class="dt-muted dt-service-empty" x-display={() => node() !== undefined && entries().length === 0 && error() === ''}>
          No own fields
        </div>
        <div class="dt-store-error" x-display={() => error() !== ''}>{() => error()}</div>
      </div>
    </div>
  );
}

function RegistrationRow(props: { token: string; model: ServicesModel }) {
  const { token, model } = props;
  const registration = () => model.state.registrations.find((r) => r.token === token);
  return (
    <div class={() => `dt-registration${registration() !== undefined && model.isActive(registration()!) ? ' active' : ''}`} x-display={() => model.shows(registration())}>
      <b class="dt-service-token">{token}</b>
      <span class={() => `dt-lifetime ${registration()?.lifetime ?? ''}`}>{() => registration()?.lifetime ?? ''}</span>
      <span class="dt-registration-status">{() => (registration() === undefined ? '' : model.statusOf(registration()!))}</span>
    </div>
  );
}

function ActivityRow(props: { entry: Activity; model: ServicesModel }) {
  const { entry, model } = props;
  return (
    <div class="dt-activity">
      <span class="dt-mono dt-muted">{formatClock(entry.at)}</span>
      <span class={`dt-activity-type ${entry.type}`}>{entry.type}</span>
      <b class="dt-service-token">{entry.token}</b>
      <span class="dt-muted">{() => model.labelOf(entry.scope)}</span>
    </div>
  );
}

export class ServicesPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  model = FromService(ServicesModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-services');
  }

  override view() {
    const m = this.model;
    const splitText = () => LIFETIMES.map((lifetime) => `${m.state.registrations.filter((r) => r.lifetime === lifetime).length} ${lifetime}`).join(' · ');
    const totalText = () => `${plural(m.state.registrations.length, 'service')} registered · ${m.activeCount} active`;
    const slots = () => m.slots(m.state.selected);
    const transients = () => (m.selectedScope?.transients ?? []).map((t) => formatValue(t).text).join(', ');
    const headText = () => {
      const scope = m.selectedScope;
      if (scope === undefined) return '';
      const tag = scopeTag(scope);
      return tag === '' ? scopeLabel(scope) : `${scopeLabel(scope)} · ${tag}`;
    };
    const headHint = () => (m.selectedScope?.kind === 'root' ? 'Singletons, and scoped services resolved outside a navigation' : 'Scoped services created in this scope');
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>DEPENDENCY INJECTION</small>
            <h1>Services</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.load()}>
              <span class="dt-button-icon" x-html={ICONS.refresh}></span>
              Refresh
            </button>
          </div>
        </header>

        <div class="dt-panel dt-route-card dt-service-card">
          <span class="dt-route-icon" x-html={ICONS.services}></span>
          <div class="dt-route-main">
            <b class="dt-route-uri dt-service-total">{() => totalText()}</b>
            <small>{() => `Current scope: ${scopeLabel(m.current)}`}</small>
            <span class="dt-log-split dt-muted">{() => splitText()}</span>
          </div>
          <span class="dt-route-state">Runtime connected</span>
        </div>

        <div class="dt-services-split">
          <div class="dt-panel dt-scopes">
            <div class="dt-panel-head">
              <div>
                <b>Scopes</b>
                <small>Root, one per navigation, and scopes opened in code</small>
              </div>
            </div>
            {m.state.rows.map((row) => (
              <ScopeRowView key={`${row.id}:${row.depth}`} row={row} model={m} />
            ))}
          </div>

          <div class="dt-panel dt-scope-services">
            <div class="dt-panel-head">
              <div>
                <b class="dt-scope-title">{() => headText()}</b>
                <small>{() => headHint()}</small>
              </div>
            </div>
            <div class="dt-empty small" x-display={() => slots().length === 0}>
              No services here.
            </div>
            {slots().map((slot) => (
              <ServiceSlotView key={`${m.state.selected}:${slot.token}`} scope={m.state.selected!} token={slot.token} model={m} />
            ))}
            <div class="dt-transients" x-display={() => transients() !== ''}>
              <small>TRANSIENTS KEPT FOR DISPOSAL</small>
              <span class="dt-mono">{() => transients()}</span>
            </div>
          </div>
        </div>

        <div class="dt-panel dt-registrations">
          <div class="dt-panel-head">
            <div>
              <b>Registered</b>
              <small>Every service the app registered</small>
            </div>
            <label class="dt-filter" title="Filter by lifetime">
              <span x-html={ICONS.filter}></span>
              <select
                aria-label="Filter by lifetime"
                value={() => m.state.filter}
                onchange={(e) => m.setFilter((e.target as HTMLSelectElement).value as LifetimeFilter)}
              >
                <option value="all">All lifetimes</option>
                {LIFETIMES.map((lifetime) => (
                  <option key={lifetime} value={lifetime}>
                    {lifetime}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div class="dt-empty small" x-display={() => m.state.registrations.length === 0}>
            No service registered.
          </div>
          {m.state.registrations.map((registration) => (
            <RegistrationRow key={registration.token} token={registration.token} model={m} />
          ))}
        </div>

        <div class="dt-panel dt-activities">
          <div class="dt-panel-head">
            <div>
              <b>Activity</b>
              <small>Service instances created and disposed, newest first</small>
            </div>
            <button type="button" class="dt-button" onclick={() => m.clearActivity()}>
              Clear
            </button>
          </div>
          <div class="dt-empty small" x-display={() => m.state.activity.length === 0}>
            No service created or disposed yet.
          </div>
          {m.state.activity.map((entry) => (
            <ActivityRow key={entry.key} entry={entry} model={m} />
          ))}
        </div>
      </>
    );
  }
}
