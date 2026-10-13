import { reactive } from '@motifx/core';
import type { DockPosition } from '../../bridge/protocol';
import type { Client, ClientStatus } from '../../client/client';

export type Section = 'elements' | 'reactivity' | 'router' | 'stores' | 'logs';
export type ThemeChoice = 'system' | 'light' | 'dark';

export type Counters = {
  components: { live: number; inTree: number; notInTree: number; byType: Record<string, number> };
  bindings: number;
  listeners: { dom: number; component: number };
  effects: { live: number; owned: number };
  reactivity: { runs: number; flushes: number; flushRuns: number; lastFlushDuration: number; maxFlushDuration: number };
};

const THEME_KEY = 'motif-devtools:theme';
const REFRESH_DELAY = 200;

export class DevtoolsModel {
  readonly state = reactive({
    status: { connected: false, version: null } as ClientStatus,
    section: 'elements' as Section,
    theme: readTheme(),
    counters: null as Counters | null,
    issues: 0,
    dock: null as DockPosition | null,
    picking: false,
  });

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReveal: number[] | null = null;
  private revealListener: ((path: number[]) => void) | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(readonly client: Client) {
    this.offs.push(
      client.onStatus((status) => {
        this.state.status = status;
        if (status.connected) void this.refresh();
        else this.state.counters = null;
      }),
      client.onEvent((event) => {
        if (event.type === 'devtools:pick') this.state.picking = (event.payload as { active?: boolean } | undefined)?.active === true;
        else if (event.type !== 'devtools:picked') this.scheduleRefresh();
      }),
      client.onDock((position) => {
        this.state.dock = position;
      }),
    );
  }

  select(section: Section) {
    this.state.section = section;
  }

  reveal(path: number[]) {
    this.select('elements');
    if (this.revealListener !== null) this.revealListener(path);
    else this.pendingReveal = path;
  }

  onReveal(listener: (path: number[]) => void) {
    this.revealListener = listener;
    const pending = this.pendingReveal;
    this.pendingReveal = null;
    if (pending !== null) listener(pending);
    return () => {
      if (this.revealListener === listener) this.revealListener = null;
    };
  }

  async togglePick() {
    const next = !this.state.picking;
    if (next) this.select('elements');
    try {
      await this.client.request('pick', next);
    } catch {}
  }

  setDock(position: DockPosition) {
    this.client.setDock(position);
  }

  setTheme(theme: ThemeChoice) {
    this.state.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }

  cycleTheme() {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    this.setTheme(order[(order.indexOf(this.state.theme) + 1) % order.length]);
  }

  async refresh() {
    if (!this.state.status.connected) return;
    try {
      const [counters, warnings, errors] = await Promise.all([
        this.client.request<Counters>('getCounters'),
        this.client.request<unknown[]>('getWarnings'),
        this.client.request<unknown[]>('getErrors'),
      ]);
      this.state.counters = counters;
      this.state.issues = warnings.length + errors.length;
    } catch {}
  }

  dispose() {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    for (const off of this.offs) off();
  }

  private scheduleRefresh() {
    if (this.refreshTimer !== null) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, REFRESH_DELAY);
  }
}

function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  return 'system';
}
