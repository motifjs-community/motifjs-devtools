import { Component, FromService } from '@motifx/core';
import { formatClock, formatMs } from '../format';
import { ICONS } from '../icons';
import { OUTCOMES, RouterModel, type Navigation, type OutcomeFilter } from '../model/RouterModel';
import { ValueList } from '../ValueList';

const targetOf = (nav: Navigation) => nav.uri ?? nav.requested;
const rewritten = (nav: Navigation) => nav.uri !== null && nav.uri !== nav.requested;
const routeText = (model: RouterModel) => model.state.route?.uri ?? '–';
const chainText = (model: RouterModel) => (model.state.route?.chain ?? []).join(' › ');
const stateText = (model: RouterModel) => (model.state.navigating === null ? 'Runtime connected' : `Navigating to ${model.state.navigating}`);
const numberOf = (model: RouterModel, nav: Navigation) => String(model.state.navigations.findIndex((n) => n.key === nav.key) + 1).padStart(2, '0');

function NavigationEntry(props: { nav: Navigation; model: RouterModel }) {
  const { nav, model } = props;
  const open = () => model.state.expanded === nav.key;
  return (
    <div
      class={() => (open() ? 'dt-nav-entry open' : 'dt-nav-entry')}
      x-display={() => model.state.filter === 'all' || model.state.filter === nav.outcome}
    >
      <button type="button" class="dt-nav-row" onclick={() => model.toggle(nav.key)}>
        <span class="dt-mono dt-muted">{() => numberOf(model, nav)}</span>
        <span class="dt-route-cell">
          <b class="dt-route-target">{targetOf(nav)}</b>
          <small x-display={() => rewritten(nav)}>{`requested ${nav.requested}`}</small>
        </span>
        <span class={`dt-outcome ${nav.outcome}`}>{nav.outcome}</span>
        <span class="dt-mono">{formatMs(nav.duration)}</span>
        <span class="dt-chevron" x-html={ICONS.chevron}></span>
      </button>
      <dl class="dt-nav-detail" x-display={() => open()}>
        <dt>Requested</dt>
        <dd class="dt-mono">{nav.requested}</dd>
        <dt>Resolved</dt>
        <dd class="dt-mono">{nav.uri ?? '–'}</dd>
        <dt>Time</dt>
        <dd class="dt-mono">{formatClock(nav.at)}</dd>
        <dt x-display={() => nav.reason !== undefined}>Reason</dt>
        <dd x-display={() => nav.reason !== undefined}>{nav.reason ?? ''}</dd>
        <dt>Params</dt>
        <dd>
          <ValueList value={() => nav.params} empty="No params" />
        </dd>
      </dl>
    </div>
  );
}

export class RouterPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  model = FromService(RouterModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-router');
  }

  override view() {
    const m = this.model;
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>NAVIGATION ACTIVITY</small>
            <h1>Router</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.load()}>
              <span class="dt-button-icon" x-html={ICONS.refresh}></span>
              Refresh
            </button>
          </div>
        </header>

        <div class="dt-empty small dt-no-router" x-display={() => !m.state.hasRouter}>
          This app has not called <code>app.useRouter()</code>.
        </div>

        <div class="dt-panel dt-route-card">
          <span class="dt-route-icon" x-html={ICONS.router}></span>
          <div class="dt-route-main">
            <b class="dt-route-uri">{() => routeText(m)}</b>
            <small>Current route</small>
            <span class="dt-route-chain dt-mono dt-muted" x-display={() => m.state.route !== null}>
              {() => chainText(m)}
            </span>
            <span class="dt-route-params" x-display={() => m.state.route !== null}>
              <ValueList value={() => m.state.route?.params} empty="No params" />
            </span>
          </div>
          <span class={() => (m.state.navigating === null ? 'dt-route-state' : 'dt-route-state busy')}>{() => stateText(m)}</span>
        </div>

        <div class="dt-panel">
          <div class="dt-panel-head">
            <div>
              <b>Recent activity</b>
              <small>Captured since DevTools was enabled</small>
            </div>
            <label class="dt-filter" title="Filter by outcome">
              <span x-html={ICONS.filter}></span>
              <select
                aria-label="Filter by outcome"
                value={() => m.state.filter}
                onchange={(e) => m.setFilter((e.target as HTMLSelectElement).value as OutcomeFilter)}
              >
                <option value="all">All outcomes</option>
                {OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {outcome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div class="dt-empty small dt-nav-empty" x-display={() => m.visible.length === 0}>
            No navigation recorded yet.
          </div>
          {m.state.navigations.map((nav) => (
            <NavigationEntry key={nav.key} nav={nav} model={m} />
          ))}
        </div>
      </>
    );
  }
}
