import { effect, reactive, untracked } from '@motifx/core';
import type { ContractResult, ExtensionPanels, ExtensionSourceSettings } from '../../bridge/protocol';
import { MARK } from '../../bridge/serialize';
import type { Client, ClientEvent } from '../../client/client';
import type { ButtonWidget, OpenRoute, Params, PanelRoute, PerformanceLane, RowParam, Widget } from '../schema';
import { fieldOf } from '../values';
import { DESCRIBE_SOURCE, describePanel, parseExtension, type ParsedPanel } from './panels';
import { changeRows, trimRows, type RowAction } from './rows';
import { READ_GAP, Reader } from './reader';

export type SourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SourceEntry = { key: string; source: string; params: Record<string, unknown>; status: SourceStatus; value: unknown; error: string | null; stale: boolean; ticket: number };

/** The route a panel shows instead of its layout, with the parameters its widgets read as `{ param }`. */
export type RouteState = { id: string; params: Record<string, unknown> };

/** What a package's `reveal()` points at: a panel, a route of it with parameters, and values for the panel's state. */
export type RevealTarget = { panel: string; route?: string; params?: Record<string, unknown>; state?: Record<string, unknown> };

export type PanelRecord = {
  key: string;
  name: string;
  id: string;
  title: string;
  icon: string;
  order: number;
  capabilities: { read: boolean; subscribe: boolean; write: boolean };
  layout: Widget | null;
  routes: PanelRoute[];
  lanes: PerformanceLane[];
  error: string | null;
  /** The panel's own state: selections and filters the widgets write and read. Kept while the panel exists. */
  values: Record<string, unknown>;
  /** The open route, or none for the panel's own layout. */
  route: RouteState | null;
  /** A reveal of the package that waits for the user to open this panel; the sidebar marks it. */
  pending: RevealTarget | null;
  entries: SourceEntry[];
  notice: string | null;
  busy: string | null;
  /** Grows when the layout changes; the page rebuilds its widgets on it. */
  version: number;
};

export type ExtensionRecord = {
  name: string;
  panels: PanelRecord[];
  sources: Record<string, ExtensionSourceSettings>;
  commands: string[];
  error: string | null;
  /** Events of the package the bridge dropped because they came faster than the limit. */
  dropped: number;
};

export const panelKey = (name: string, id: string) => `ext:${name}:${id}`;
export const isPanelSection = (section: string) => section.startsWith('ext:');

const entryKey = (source: string, params: Record<string, unknown>) => `${source}\u0000${JSON.stringify(params)}`;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// what goes to the page crosses postMessage, and a reactive proxy cannot be cloned; a value read out of the
// panel's state is a proxy again, so the copy is made right before sending
const plain = <T>(value: T): T => (value === null || typeof value !== 'object' ? value : (JSON.parse(JSON.stringify(value)) as T));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isTarget = (value: unknown): value is RevealTarget =>
  isRecord(value) &&
  typeof value.panel === 'string' &&
  (value.route === undefined || typeof value.route === 'string') &&
  (value.params === undefined || isRecord(value.params)) &&
  (value.state === undefined || isRecord(value.state));

/** Whether the user is writing somewhere in the panel; a reveal then waits instead of moving them. */
const typing = () => {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (active === null) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable === true;
};

export class ExtensionsModel {
  readonly state = reactive({
    extensions: [] as ExtensionRecord[],
    panels: [] as PanelRecord[],
    /** Packages the bridge left out of the list because there were more than it carries. */
    overflow: 0,
  });

  private loading = 0;
  private readonly reader: Reader;
  private readonly readers = new Map<string, Reader>();
  /** Reveals that came before their panel was listed, by panel key. */
  private readonly waiting = new Map<string, RevealTarget>();
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: Client,
    private readonly section: () => string = () => '',
    private readonly delay = READ_GAP,
    private readonly shown: () => boolean = () => true,
    /** Opens a section of the panel app; a reveal uses it when it may move the user. */
    private readonly go: ((section: string) => void) | null = null,
  ) {
    this.reader = new Reader(() => this.load(), this.shown, this.delay);
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.reader.request(true);
        else this.clear();
      }),
      client.onEvent((event) => this.onEvent(event)),
      // a reveal that waited is applied when the user opens the panel
      effect(() => {
        const key = this.section();
        const panel = this.state.panels.find((item) => item.key === key);
        const target = panel?.pending ?? null;
        if (panel === undefined || target === null) return;
        untracked(() => this.applyTarget(panel, target));
      }),
    );
  }

  /** Reads the list of packages and the panels of each; a panel keeps its identity, state and values across reads. */
  async load() {
    const ticket = ++this.loading;
    let names: unknown;
    try {
      names = await this.client.request('getExtensions');
    } catch {
      return;
    }
    if (ticket !== this.loading) return;
    const all = Array.isArray(names) ? names : [];
    const list = all.filter((name): name is string => typeof name === 'string');
    const marker = all.find((item) => typeof item === 'object' && item !== null && (item as { [MARK]?: unknown })[MARK] === 'truncated') as { remaining?: unknown } | undefined;
    const records = await Promise.all(list.map((name) => this.loadExtension(name)));
    if (ticket !== this.loading) return;
    this.state.overflow = typeof marker?.remaining === 'number' ? marker.remaining : 0;
    this.apply(records);
  }

  activePanel(section: string): PanelRecord | null {
    return this.state.panels.find((panel) => panel.key === section) ?? null;
  }

  /** The record of a source read with these parameters; made and read on first use, then kept with the panel. */
  entry(panel: PanelRecord, source: string, params: Record<string, unknown>): SourceEntry {
    const key = entryKey(source, params);
    let entry = panel.entries.find((item) => item.key === key);
    if (entry === undefined) {
      panel.entries.push({ key, source, params, status: 'idle', value: undefined, error: null, stale: true, ticket: 0 });
      entry = panel.entries[panel.entries.length - 1];
    }
    if (entry.stale) void this.readers.get(panel.key)?.request();
    return entry;
  }

  /** Literal values stay; `{ state }` reads the panel's state, `{ param }` a parameter of the open route. */
  resolve(panel: PanelRecord, params: Params | undefined): Record<string, unknown> {
    return this.resolveRow(panel, params, undefined);
  }

  /** As `resolve`, and `{ field }` reads the row the user opened. */
  resolveRow(panel: PanelRecord, params: Record<string, RowParam> | undefined, row: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (params === undefined) return out;
    for (const [key, param] of Object.entries(params)) out[key] = this.valueOf(panel, param, row);
    return plain(out);
  }

  private valueOf(panel: PanelRecord, param: RowParam, row: unknown): unknown {
    if (param === null || typeof param !== 'object') return param;
    if ('state' in param) return panel.values[param.state];
    if ('param' in param) return panel.route?.params[param.param];
    if ('field' in param) return row === undefined ? undefined : fieldOf(row, param.field);
    return undefined;
  }

  setValue(panel: PanelRecord, key: string, value: unknown) {
    panel.values[key] = value;
  }

  /** The route the panel shows, if the open one still exists. */
  routeOf(panel: PanelRecord): PanelRoute | null {
    const open = panel.route;
    return open === null ? null : (panel.routes.find((route) => route.id === open.id) ?? null);
  }

  openRoute(panel: PanelRecord, id: string, params: Record<string, unknown>) {
    if (!panel.routes.some((route) => route.id === id)) {
      panel.notice = `This panel has no "${id}" view`;
      return;
    }
    panel.notice = null;
    panel.route = { id, params: plain(params) };
  }

  closeRoute(panel: PanelRecord) {
    panel.route = null;
  }

  /** A row was opened: the route gets what `open` names from the row, the state and the current route. */
  open(panel: PanelRecord, open: OpenRoute, row: unknown) {
    this.openRoute(panel, open.route, this.resolveRow(panel, open.params, row));
  }

  /** The title of the open route: as given, or a field of its source read with its parameters; the id until then. */
  routeTitle(panel: PanelRecord): string {
    const route = this.routeOf(panel);
    if (route === null) return '';
    if (typeof route.title === 'string') return route.title;
    if (route.title === undefined || route.source === undefined) return route.id;
    const { source } = route;
    const params = this.resolve(panel, route.params);
    const entry = untracked(() => this.entry(panel, source, params));
    const value = fieldOf(entry.value, route.title.field);
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') return String(value);
    return entry.status === 'loading' || entry.status === 'idle' ? '…' : route.id;
  }

  async run(panel: PanelRecord, widget: ButtonWidget): Promise<void> {
    if (widget.navigate !== undefined) {
      this.openRoute(panel, widget.navigate.route, this.resolve(panel, widget.navigate.params));
      return;
    }
    if (widget.command === undefined) return;
    if (!panel.capabilities.write) {
      panel.notice = `${widget.label}: this panel may not run commands`;
      return;
    }
    if (widget.confirm !== undefined && typeof globalThis.confirm === 'function' && !globalThis.confirm(widget.confirm)) return;
    panel.busy = widget.command;
    panel.notice = null;
    try {
      const result = await this.client.request<ContractResult>('callExtension', panel.name, panel.id, widget.command, plain(this.resolve(panel, widget.args)));
      if (!result.ok) panel.notice = `${widget.label}: ${result.error}`;
    } catch (error) {
      panel.notice = `${widget.label}: ${message(error)}`;
    } finally {
      panel.busy = null;
    }
    for (const source of widget.refresh ?? []) this.invalidate(panel.name, source);
  }

  /** Marks the reads of a source stale in every panel of the package and reads them again where the panel is open. */
  invalidate(name: string, source: string) {
    for (const panel of this.state.panels) {
      if (panel.name !== name) continue;
      let any = false;
      for (const entry of panel.entries) {
        if (entry.source !== source) continue;
        entry.stale = true;
        any = true;
      }
      if (any) void this.readers.get(panel.key)?.request();
    }
  }

  refresh(panel: PanelRecord) {
    for (const entry of panel.entries) entry.stale = true;
    void this.readers.get(panel.key)?.request(true);
  }

  /**
   * The package points at a panel, a route or a selection. The panel shows it at once when it is open, or when the
   * panel app is shown and nobody is typing in it; otherwise the sidebar marks the panel and the target waits there.
   * A target for a panel not listed yet waits for the list.
   */
  reveal(name: string, target: unknown) {
    if (!isTarget(target)) return;
    const key = panelKey(name, target.panel);
    const panel = this.state.panels.find((item) => item.key === key);
    if (panel === undefined) {
      this.waiting.set(key, target);
      void this.reader.request();
      return;
    }
    this.show(panel, target);
  }

  private show(panel: PanelRecord, target: RevealTarget) {
    if (this.shown() && this.section() === panel.key) {
      this.applyTarget(panel, target);
      return;
    }
    if (this.shown() && this.go !== null && !typing()) {
      this.go(panel.key);
      this.applyTarget(panel, target);
      return;
    }
    panel.pending = target;
  }

  private applyTarget(panel: PanelRecord, target: RevealTarget) {
    panel.pending = null;
    for (const [key, value] of Object.entries(target.state ?? {})) panel.values[key] = value;
    if (typeof target.route === 'string') this.openRoute(panel, target.route, target.params ?? {});
    else panel.route = null;
  }

  wake() {
    this.reader.wake();
    this.readers.get(this.section())?.wake();
  }

  dispose() {
    this.reader.dispose();
    for (const reader of this.readers.values()) reader.dispose();
    this.readers.clear();
    for (const off of this.offs) off();
  }

  private async loadExtension(name: string): Promise<ExtensionRecord> {
    try {
      const result = await this.client.request<ContractResult<ExtensionPanels>>('readExtensionPanels', name);
      if (!result.ok) return this.record(name, parseExtension(undefined), result.error);
      return this.record(name, parseExtension(result.value), null);
    } catch (error) {
      // a core from before the panels still lists the package; describe() shows in a panel of its own
      const reason = message(error);
      return this.record(name, parseExtension(undefined), reason === 'unknown-method' ? null : reason);
    }
  }

  private record(name: string, parsed: ReturnType<typeof parseExtension>, error: string | null): ExtensionRecord {
    const panels = parsed.panels.length > 0 ? parsed.panels : [describePanel(name)];
    const dropped = this.state.extensions.find((item) => item.name === name)?.dropped ?? 0;
    return { name, panels: panels.map((panel) => this.panelRecord(name, panel)), sources: parsed.sources, commands: parsed.commands, error, dropped };
  }

  private panelRecord(name: string, panel: ParsedPanel): PanelRecord {
    return {
      key: panelKey(name, panel.id),
      name,
      id: panel.id,
      title: panel.title,
      icon: panel.icon,
      order: panel.order,
      capabilities: panel.capabilities,
      layout: panel.layout,
      routes: panel.routes,
      lanes: panel.lanes,
      error: panel.error,
      values: {},
      route: null,
      pending: null,
      entries: [],
      notice: null,
      busy: null,
      version: 1,
    };
  }

  private apply(records: ExtensionRecord[]) {
    const known = new Map(this.state.panels.map((panel) => [panel.key, panel]));
    const panels: PanelRecord[] = [];
    for (const record of records) {
      record.panels = record.panels.map((next) => {
        const kept = known.get(next.key);
        if (kept === undefined) return next;
        if (JSON.stringify(kept.layout) !== JSON.stringify(next.layout) || JSON.stringify(kept.routes) !== JSON.stringify(next.routes)) {
          kept.layout = next.layout;
          kept.routes = next.routes;
          kept.version++;
          if (kept.route !== null && !next.routes.some((route) => route.id === kept.route?.id)) kept.route = null;
        }
        kept.lanes = next.lanes;
        kept.title = next.title;
        kept.icon = next.icon;
        kept.order = next.order;
        kept.capabilities = next.capabilities;
        kept.error = next.error;
        return kept;
      });
      panels.push(...record.panels);
    }
    panels.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    this.state.extensions = records;
    this.state.panels = panels;
    const keys = new Set(panels.map((panel) => panel.key));
    for (const [key, reader] of this.readers) {
      if (keys.has(key)) continue;
      reader.dispose();
      this.readers.delete(key);
    }
    for (const key of keys) {
      if (this.readers.has(key)) continue;
      this.readers.set(key, new Reader(() => this.loadPanel(key), () => this.shown() && this.section() === key, this.delay));
    }
    this.readers.get(this.section())?.wake();
    for (const [key, target] of [...this.waiting]) {
      const panel = panels.find((item) => item.key === key);
      if (panel === undefined) continue;
      this.waiting.delete(key);
      this.show(panel, target);
    }
  }

  private clear() {
    this.loading++;
    this.state.extensions = [];
    this.state.panels = [];
    this.state.overflow = 0;
    this.waiting.clear();
    for (const reader of this.readers.values()) reader.dispose();
    this.readers.clear();
  }

  private async loadPanel(key: string) {
    const panel = this.activePanel(key);
    if (panel === null) return;
    const due = panel.entries.filter((entry) => entry.stale || entry.status === 'idle');
    await Promise.all(due.map((entry) => this.read(panel, entry)));
  }

  private async read(panel: PanelRecord, entry: SourceEntry) {
    const ticket = ++entry.ticket;
    entry.status = 'loading';
    entry.stale = false;
    try {
      const result =
        entry.source === DESCRIBE_SOURCE
          ? ({ ok: true, value: await this.client.request('readExtension', panel.name) } as ContractResult)
          : await this.client.request<ContractResult>('readExtensionSource', panel.name, panel.id, entry.source, plain(entry.params));
      if (ticket !== entry.ticket) return;
      if (result.ok) {
        if (Array.isArray(result.value)) trimRows(result.value, this.settingsOf(panel.name, entry.source));
        entry.value = result.value;
        entry.error = null;
        entry.status = 'ready';
      } else {
        entry.error = result.error;
        entry.status = 'error';
      }
    } catch (error) {
      if (ticket !== entry.ticket) return;
      entry.error = message(error);
      entry.status = 'error';
    }
  }

  private onEvent(event: ClientEvent) {
    if (event.type === 'extension:registered' || event.type === 'extension:disposed') {
      void this.reader.request();
      return;
    }
    // describe() reads the app's state; a flush is its only signal when the package names no sources
    if (event.type === 'reactivity:flush') {
      for (const panel of this.state.panels) this.invalidate(panel.name, DESCRIBE_SOURCE);
      return;
    }
    if (event.type === 'devtools:ext-dropped') {
      const payload = (event.payload ?? {}) as { name?: unknown; count?: unknown };
      const record = this.state.extensions.find((item) => item.name === payload.name);
      if (record !== undefined && typeof payload.count === 'number') record.dropped += payload.count;
      return;
    }
    if (event.type === 'extension:changed') {
      const payload = (event.payload ?? {}) as { name?: unknown; source?: unknown };
      if (typeof payload.name === 'string' && typeof payload.source === 'string') this.invalidate(payload.name, payload.source);
      else void this.reader.request();
      return;
    }
    if (event.type === 'extension:reveal') {
      const payload = (event.payload ?? {}) as { name?: unknown; target?: unknown };
      if (typeof payload.name === 'string') this.reveal(payload.name, payload.target);
      return;
    }
    if (event.type.startsWith('ext:')) this.onPackageEvent(event.type.slice(4), event.payload);
  }

  /**
   * `ext:<name>:<type>`: a source whose `events` names the type is read again (`refresh`) or changed in place from
   * the payload (`upsert`, `append`, `remove`); what describe() gives is read again either way.
   */
  private onPackageEvent(rest: string, payload: unknown) {
    const at = rest.indexOf(':');
    if (at <= 0) return;
    const name = rest.slice(0, at);
    const type = rest.slice(at + 1);
    const record = this.state.extensions.find((item) => item.name === name);
    if (record === undefined) return;
    for (const [source, settings] of Object.entries(record.sources)) {
      const action = settings.events?.[type];
      if (action === undefined) continue;
      if (action === 'refresh') this.invalidate(name, source);
      else this.changeRows(name, source, settings, action, payload);
    }
    this.invalidate(name, DESCRIBE_SOURCE);
  }

  /** The rows a panel holds of the source follow the event; a read that is not there yet is simply made again. */
  private changeRows(name: string, source: string, settings: ExtensionSourceSettings, action: RowAction, payload: unknown) {
    for (const panel of this.state.panels) {
      if (panel.name !== name) continue;
      for (const entry of panel.entries) {
        if (entry.source !== source) continue;
        if (entry.status === 'ready' && Array.isArray(entry.value)) changeRows(entry.value, settings, action, payload);
        else {
          entry.stale = true;
          void this.readers.get(panel.key)?.request();
        }
      }
    }
  }

  private settingsOf(name: string, source: string): ExtensionSourceSettings {
    return this.state.extensions.find((item) => item.name === name)?.sources[source] ?? {};
  }
}
