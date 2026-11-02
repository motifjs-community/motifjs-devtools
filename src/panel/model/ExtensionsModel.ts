import { reactive } from '@motifx/core';
import type { ContractResult, ExtensionPanels, ExtensionSourceSettings } from '../../bridge/protocol';
import { MARK } from '../../bridge/serialize';
import type { Client, ClientEvent } from '../../client/client';
import type { ButtonWidget, Params, PanelRoute, PerformanceLane, Widget } from '../schema';
import { DESCRIBE_SOURCE, describePanel, parseExtension, type ParsedPanel } from './panels';
import { changeRows, trimRows, type RowAction } from './rows';
import { READ_GAP, Reader } from './reader';

export type SourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SourceEntry = { key: string; source: string; params: Record<string, unknown>; status: SourceStatus; value: unknown; error: string | null; stale: boolean; ticket: number };

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
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly client: Client,
    private readonly section: () => string = () => '',
    private readonly delay = READ_GAP,
    private readonly shown: () => boolean = () => true,
  ) {
    this.reader = new Reader(() => this.load(), this.shown, this.delay);
    this.offs.push(
      client.onStatus((status) => {
        if (status.connected) void this.reader.request(true);
        else this.clear();
      }),
      client.onEvent((event) => this.onEvent(event)),
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

  /** Literal values stay; `{ state }` reads the panel's state. Route parameters come with the routes. */
  resolve(panel: PanelRecord, params: Params | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (params === undefined) return out;
    for (const [key, param] of Object.entries(params)) {
      if (param !== null && typeof param === 'object') out[key] = 'state' in param ? panel.values[param.state] : undefined;
      else out[key] = param;
    }
    return plain(out);
  }

  setValue(panel: PanelRecord, key: string, value: unknown) {
    panel.values[key] = value;
  }

  async run(panel: PanelRecord, widget: ButtonWidget): Promise<void> {
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
  }

  private clear() {
    this.loading++;
    this.state.extensions = [];
    this.state.panels = [];
    this.state.overflow = 0;
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
