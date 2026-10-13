import { Component, FromService } from '@motifx/core';
import type { ClientStatus } from '../client/client';
import { VERSION } from '../version';
import { formatMs } from './format';
import { ICONS } from './icons';
import type { DockPosition } from '../bridge/protocol';
import { DevtoolsModel, type Section } from './model/DevtoolsModel';
import { ElementsPage } from './pages/ElementsPage';
import { ReactivityPage } from './pages/ReactivityPage';
import { RouterPage } from './pages/RouterPage';
import { SectionPlaceholder } from './pages/SectionPlaceholder';

export const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'elements', label: 'Elements', icon: ICONS.elements },
  { id: 'reactivity', label: 'Reactivity', icon: ICONS.reactivity },
  { id: 'router', label: 'Router', icon: ICONS.router },
  { id: 'stores', label: 'Stores', icon: ICONS.stores },
  { id: 'logs', label: 'Logs', icon: ICONS.logs },
];

const DOCKS: { id: DockPosition; label: string; icon: string }[] = [
  { id: 'bottom', label: 'Dock to bottom', icon: ICONS.dockBottom },
  { id: 'right', label: 'Dock to right', icon: ICONS.dockRight },
  { id: 'window', label: 'Open in a separate window', icon: ICONS.popout },
];

const labelOf = (section: Section) => SECTIONS.find((s) => s.id === section)?.label ?? '';

const statusText = (status: ClientStatus) => {
  if (status.connected) return 'Connected';
  if (status.reason === 'unsupported-version') return `Unsupported contract v${status.version}`;
  return 'Waiting for the app';
};

const contractText = (status: ClientStatus) => (status.connected ? `Contract v${status.version}` : 'Not connected');

export class Shell extends Component<HTMLDivElement> {
  model = FromService(DevtoolsModel)!;

  override onConfigured() {
    this.class.add('dt-app');
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
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  class={() => (m.state.section === section.id ? 'dt-nav active' : 'dt-nav')}
                  onclick={() => m.select(section.id)}
                >
                  <span class="dt-nav-icon" x-html={section.icon}></span>
                  <span class="dt-nav-label">{section.label}</span>
                  <span class="dt-badge" x-display={() => section.id === 'logs' && m.state.issues > 0}>
                    {() => m.state.issues}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
              <b>{() => labelOf(m.state.section)}</b>
            </div>
            <div class="dt-stats" x-display={() => m.state.counters !== null}>
              <span><b>{() => m.state.counters?.components.inTree ?? 0}</b> components</span>
              <span><b>{() => m.state.counters?.effects.live ?? 0}</b> effects</span>
              <span class="dt-flush"><b>{() => formatMs(m.state.counters?.reactivity.lastFlushDuration)}</b> last flush</span>
            </div>
          </div>
          <div class="dt-page">
            <div class="dt-empty" x-display={() => !m.state.status.connected}>
              <b>{() => statusText(m.state.status)}</b>
              <p>
                Call <code>app.useDevelopment(true)</code> in the inspected app. The panel connects as soon as the
                devtools contract appears.
              </p>
            </div>
            <ElementsPage x-wait={() => !m.state.status.connected || m.state.section !== 'elements'} />
            <ReactivityPage x-wait={() => !m.state.status.connected || m.state.section !== 'reactivity'} />
            <RouterPage x-wait={() => !m.state.status.connected || m.state.section !== 'router'} />
            {SECTIONS.filter((section) => section.id === 'stores' || section.id === 'logs').map((section) => (
              <SectionPlaceholder
                key={section.id}
                title={section.label}
                x-wait={() => !m.state.status.connected || m.state.section !== section.id}
              />
            ))}
          </div>
        </main>
      </>
    );
  }
}
