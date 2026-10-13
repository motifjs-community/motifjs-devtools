import { Component, FromService } from '@motifx/core';
import { formatClock, formatMs } from '../format';
import { ICONS } from '../icons';
import { OUTCOMES, RouterModel, type Navigation, type OutcomeFilter, type RouteRow } from '../model/RouterModel';
import { ValueList } from '../ValueList';

const routeClass = (model: RouterModel, row: RouteRow | undefined, open: boolean) =>
  `dt-route-node${open ? ' open' : ''}${model.isActive(row) ? ' active' : ''}${model.isCurrent(row) ? ' current' : ''}`;
const listText = (items: string[] | undefined) => (items === undefined || items.length === 0 ? '–' : items.join(', '));

function RouteNode(props: { id: string; model: RouterModel }) {
  const { id, model } = props;
  const row = () => model.row(id);
  const open = () => model.state.openRoute === id;
  return (
    <div class={() => routeClass(model, row(), open())}>
      <button type="button" class="dt-route-row" style={() => `--level: ${row()?.depth ?? 0}`} onclick={() => model.toggleRoute(id)}>
        <span class="dt-route-path dt-mono">{() => row()?.path || '/'}</span>
        <span class="dt-route-tags">
          <span class="dt-route-tag name" x-display={() => row()?.name != null}>{() => row()?.name ?? ''}</span>
          <span class="dt-route-tag control" x-display={() => row()?.control != null}>{() => `<${row()?.control ?? ''}>`}</span>
          <span class="dt-route-tag redirect" x-display={() => row()?.redirect != null}>{() => `→ ${row()?.redirect ?? ''}`}</span>
          <span class="dt-route-tag keep" x-display={() => row()?.keepAlive === true}>keepAlive</span>
          <span class="dt-route-tag hook" x-display={() => (row()?.hooks.length ?? 0) > 0}>{() => row()?.hooks.join(' · ') ?? ''}</span>
        </span>
        <span class="dt-route-here" x-display={() => model.isCurrent(row())}>current</span>
        <span class="dt-chevron" x-html={ICONS.chevron}></span>
      </button>
      <dl class="dt-nav-detail dt-route-detail" x-display={() => open()}>
        <dt>Full path</dt>
        <dd class="dt-mono">{() => row()?.fullPath ?? ''}</dd>
        <dt>Name</dt>
        <dd class="dt-mono">{() => row()?.name ?? '–'}</dd>
        <dt>Component</dt>
        <dd class="dt-mono">{() => row()?.control ?? '–'}</dd>
        <dt>Redirect</dt>
        <dd class="dt-mono">{() => row()?.redirect ?? '–'}</dd>
        <dt>Alias</dt>
        <dd class="dt-mono">{() => listText(row()?.alias)}</dd>
        <dt>Keep alive</dt>
        <dd>{() => (row()?.keepAlive ? 'yes' : 'no')}</dd>
        <dt>Hooks</dt>
        <dd class="dt-mono">{() => listText(row()?.hooks)}</dd>
        <dt>Children</dt>
        <dd>{() => String(row()?.childCount ?? 0)}</dd>
        <dt>Meta</dt>
        <dd>
          <ValueList value={() => row()?.meta} empty="No meta" />
        </dd>
        <dt x-display={() => row()?.extend !== undefined}>Extend</dt>
        <dd x-display={() => row()?.extend !== undefined}>
          <ValueList value={() => row()?.extend} empty="Empty" />
        </dd>
      </dl>
    </div>
  );
}

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

        <nav class="dt-tabs dt-page-tabs">
          <button type="button" class={() => (m.state.tab === 'current' ? 'active' : '')} onclick={() => m.setTab('current')}>
            Current
          </button>
          <button type="button" class={() => (m.state.tab === 'routes' ? 'active' : '')} onclick={() => m.setTab('routes')}>
            {() => `Routes ${m.state.routes.length}`}
          </button>
        </nav>

        <div class="dt-panel dt-routes" x-display={() => m.state.tab === 'routes'}>
          <div class="dt-panel-head">
            <div>
              <b>Route configuration</b>
              <small>The routes given to app.useRouter(); the chain of the current route is marked</small>
            </div>
          </div>
          <div class="dt-empty small dt-routes-empty" x-display={() => m.state.routes.length === 0}>
            No routes.
          </div>
          {m.state.routes.map((row) => (
            <RouteNode key={`${row.key}|${row.fullPath}`} id={row.key} model={m} />
          ))}
        </div>

        <div class="dt-router-current" x-display={() => m.state.tab === 'current'}>
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
        </div>
      </>
    );
  }
}
