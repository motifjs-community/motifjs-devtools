import { Component, FromService, effect, reactive } from '@motifx/core';
import type { ClientStatus } from '../client/client';
import { VERSION } from '../version';
import { formatMs } from './format';
import { ICONS, iconOf } from './icons';
import type { DockPosition } from '../bridge/protocol';
import { DevtoolsModel, type BuiltinSection, type Section } from './model/DevtoolsModel';
import { ExtensionsModel, isPanelSection } from './model/ExtensionsModel';
import { mergeNavigation, type NavItem } from './navigation';
import { ElementsPage } from './pages/ElementsPage';
import { ExtensionPage } from './pages/ExtensionPage';
import { HomePage } from './pages/HomePage';
import { ReactivityPage } from './pages/ReactivityPage';
import { PerformancePage } from './pages/PerformancePage';
import { LogsPage } from './pages/LogsPage';
import { RouterPage } from './pages/RouterPage';
import { StoresPage } from './pages/StoresPage';
import { ServicesPage } from './pages/ServicesPage';

export const SECTIONS: { id: BuiltinSection; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: ICONS.home },
  { id: 'elements', label: 'Elements', icon: ICONS.elements },
  { id: 'reactivity', label: 'Reactivity', icon: ICONS.reactivity },
  { id: 'performance', label: 'Performance', icon: ICONS.performance },
  { id: 'router', label: 'Router', icon: ICONS.router },
  { id: 'stores', label: 'Stores', icon: ICONS.stores },
  { id: 'services', label: 'Services', icon: ICONS.services },
  { id: 'logs', label: 'Logs', icon: ICONS.logs },
];

// Built-in sections sit at 10, 20 … 80; a package places its panel among them with `order`.
const BUILTIN: NavItem[] = SECTIONS.map((section, index) => ({ key: section.id, section: section.id, label: section.label, icon: section.icon, order: (index + 1) * 10, builtin: true, writes: false, broken: false }));

const DOCKS: { id: DockPosition; label: string; icon: string }[] = [
  { id: 'bottom', label: 'Dock to bottom', icon: ICONS.dockBottom },
  { id: 'right', label: 'Dock to right', icon: ICONS.dockRight },
  { id: 'window', label: 'Open in a separate window', icon: ICONS.popout },
];

const statusText = (status: ClientStatus) => {
  if (status.connected) return 'Connected';
  if (status.reason === 'unsupported-version') return `Unsupported contract v${status.version}`;
  return 'Waiting for the app';
};

const contractText = (status: ClientStatus) => (status.connected ? `Contract v${status.version}` : 'Not connected');

export class Shell extends Component<HTMLDivElement> {
  model = FromService(DevtoolsModel)!;
  extensions = FromService(ExtensionsModel)!;
  readonly nav = reactive({ items: BUILTIN });
  private readonly known = new Map<string, NavItem>();

  override onConfigured() {
    this.class.add('dt-app');
    const stop = effect(() => {
      const panels = this.extensions.state.panels.map((panel) => ({ key: panel.key, title: panel.title, icon: iconOf(panel.icon), order: panel.order, writes: panel.capabilities.write, broken: panel.error !== null }));
      this.nav.items = mergeNavigation(BUILTIN, panels, this.known);
    });
    this.motif.setDisposable(stop);
  }

  labelOf(section: Section) {
    return this.nav.items.find((item) => item.section === section)?.label ?? '';
  }

  override view() {
    const m = this.model;
    return (
      <>
        <header class="dt-topbar">
          <div class="dt-brand">
            <span class="dt-logo" x-html={ICONS.logo}></span>
            <b>Motif DevTools</b>
            <span class="dt-version">{`v${VERSION}`}</span>
          </div>
          <div class="dt-connection">
            <span class={() => (m.state.status.connected ? 'dt-dot ok' : 'dt-dot')}></span>
            <span>{() => statusText(m.state.status)}</span>
            <code class="dt-host" x-display={() => !!m.state.status.host}>{() => m.state.status.host ?? ''}</code>
          </div>
          <div class="dt-actions">
            <button
              type="button"
              class={() => (m.state.picking ? 'dt-icon-button active' : 'dt-icon-button')}
              title="Select a component in the page"
              aria-label="Select a component in the page"
              x-display={() => m.state.status.connected}
              onclick={() => m.togglePick()}
              x-html={ICONS.pick}
            ></button>
            <button
              type="button"
              class={() => (m.state.flashing ? 'dt-icon-button active' : 'dt-icon-button')}
              title="Highlight updates in the page"
              aria-label="Highlight updates in the page"
              aria-pressed={() => String(m.state.flashing)}
              x-display={() => m.state.status.connected}
              onclick={() => m.toggleFlash()}
              x-html={ICONS.flash}
            ></button>
            <div class="dt-dock-group" x-display={() => m.state.dock !== null}>
              {DOCKS.map((dock) => (
                <button
                  key={dock.id}
                  type="button"
                  class={() => (m.state.dock === dock.id ? 'dt-icon-button active' : 'dt-icon-button')}
                  title={dock.label}
                  aria-label={dock.label}
                  onclick={() => m.setDock(dock.id)}
                  x-html={dock.icon}
                ></button>
              ))}
            </div>
            <button
              type="button"
              class="dt-icon-button"
              title={() => `Theme: ${m.state.theme}`}
              aria-label="Change theme"
              onclick={() => m.cycleTheme()}
              x-html={() => ICONS[m.state.theme]}
            ></button>
          </div>
        </header>

        <nav class="dt-sidebar">
          <ul>
            {this.nav.items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  class={() => (m.state.section === item.section ? 'dt-nav active' : 'dt-nav')}
                  onclick={() => m.select(item.section as Section)}
                >
                  <span class="dt-nav-icon" x-html={() => item.icon}></span>
                  <span class="dt-nav-label">{() => item.label}</span>
                  <span class="dt-badge" x-display={() => item.section === 'logs' && m.state.issues > 0}>
                    {() => m.state.issues}
                  </span>
                  <span class="dt-nav-mark" title="Commands of this panel change the app" x-html={ICONS.pen} x-display={() => item.writes && !item.broken}></span>
                  <span class="dt-nav-mark broken" title="This panel has a problem" x-html={ICONS.warning} x-display={() => item.broken}></span>
                </button>
              </li>
            ))}
          </ul>
          <p class="dt-nav-overflow dt-muted" x-display={() => this.extensions.state.overflow > 0}>
            {() => `${this.extensions.state.overflow} more packages are not shown`}
          </p>
          <footer class="dt-sidebar-footer">
            <span class={() => (m.state.status.connected ? 'dt-mode ok' : 'dt-mode')} x-html={ICONS.bolt}></span>
            <div>
              <b>Development</b>
              <small>{() => contractText(m.state.status)}</small>
            </div>
          </footer>
        </nav>

        <main class="dt-main">
          <div class="dt-crumbs">
            <div class="dt-path">
              <span>Motif App</span>
              <span class="dt-sep">›</span>
              <b>{() => this.labelOf(m.state.section)}</b>
            </div>
            <div class="dt-stats" x-display={() => m.state.counters !== null}>
              <span><b>{() => m.state.counters?.components.inTree ?? 0}</b> components</span>
              <span><b>{() => m.state.counters?.effects.live ?? 0}</b> effects</span>
              <span class="dt-flush"><b>{() => formatMs(m.state.counters?.reactivity.lastFlushDuration)}</b> last flush</span>
            </div>
          </div>
          <div class="dt-page">
            <HomePage x-wait={() => m.state.section !== 'home'} />
            <div class="dt-empty" x-display={() => !m.state.status.connected && m.state.section !== 'home'}>
              <b>{() => statusText(m.state.status)}</b>
              <p>
                Call <code>app.useDevelopment(true)</code> in the inspected app. The panel connects as soon as the
                devtools contract appears.
              </p>
            </div>
            <ElementsPage x-wait={() => !m.state.status.connected || m.state.section !== 'elements'} />
            <ReactivityPage x-wait={() => !m.state.status.connected || m.state.section !== 'reactivity'} />
            <PerformancePage x-wait={() => !m.state.status.connected || m.state.section !== 'performance'} />
            <RouterPage x-wait={() => !m.state.status.connected || m.state.section !== 'router'} />
            <StoresPage x-wait={() => !m.state.status.connected || m.state.section !== 'stores'} />
            <ServicesPage x-wait={() => !m.state.status.connected || m.state.section !== 'services'} />
            <LogsPage x-wait={() => !m.state.status.connected || m.state.section !== 'logs'} />
            <ExtensionPage x-wait={() => !m.state.status.connected || !isPanelSection(m.state.section)} />
          </div>
        </main>
      </>
    );
  }
}
