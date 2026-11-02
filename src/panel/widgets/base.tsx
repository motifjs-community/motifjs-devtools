import { Component, effect, reactive, untracked } from '@motifx/core';
import { MARK } from '../../bridge/serialize';
import { entriesOf, fieldOf, isTruncated, rowsOf } from '../values';
import { formatClock, formatMs, formatPath, formatValue } from '../format';
import type { ExtensionsModel, PanelRecord, SourceEntry } from '../model/ExtensionsModel';
import type { Format, Params, Tone, Widget } from '../schema';
import { formatBytes } from '../timeline';

/** What every widget view gets: the panel, the model, and the function containers build their children with. */
export type Scope = { panel: PanelRecord; model: ExtensionsModel; build: (widget: Widget, scope: Scope) => Component };

export { entriesOf, fieldOf, isTruncated, rowsOf };

export const toneClass = (tone: Tone | undefined) => (tone === undefined ? '' : ` tone-${tone}`);

const relative = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
};

export function formatText(value: unknown, format: Format | undefined): string {
  if (value === undefined || value === null) return '';
  switch (format) {
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
    case 'ms':
      return typeof value === 'number' ? formatMs(value) : String(value);
    case 'bytes':
      return typeof value === 'number' ? formatBytes(value) : String(value);
    case 'date':
      return new Date(value as number | string).toLocaleString('en-US');
    case 'time':
      return typeof value === 'number' ? formatClock(value) : String(value);
    case 'relative':
      return typeof value === 'number' ? relative(Date.now() - value) : String(value);
    case 'json':
      return JSON.stringify(value);
    case 'component':
      return Array.isArray(value) ? formatPath(value as number[]) : formatValue(value).text;
    default:
      return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : formatValue(value).text;
  }
}

/** The number a counter shows: a count for lists and collections, the number itself otherwise. */
export function countOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return rowsOf(value).length + isTruncated(value);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record[MARK] === 'array' && typeof record.length === 'number') return record.length;
    if ((record[MARK] === 'map' || record[MARK] === 'set') && typeof record.size === 'number') return record.size;
  }
  return Number.NaN;
}

/** Matches a row's field against what a filter widget wrote: text is searched, other values compared. */
export function matches(value: unknown, wanted: unknown): boolean {
  if (wanted === undefined || wanted === null || wanted === '') return true;
  if (typeof wanted === 'string') return formatText(value, undefined).toLowerCase().includes(wanted.toLowerCase());
  return Object.is(value, wanted) || String(value) === String(wanted);
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export abstract class WidgetView<W extends Widget = Widget> extends Component<HTMLDivElement> {
  widget!: W;
  scope!: Scope;

  override onBuilt() {
    const when = this.widget.when;
    if (when === undefined) return;
    const stop = effect(() => {
      if (this.scope.panel.values[when.state]) this.class.remove('dt-w-hidden');
      else this.class.add('dt-w-hidden');
    });
    this.motif.setDisposable(stop);
  }

  resolve(params: Params | undefined) {
    return this.scope.model.resolve(this.scope.panel, params);
  }
}

type Reading = Widget & { source?: string; params?: Params; field?: string };

export abstract class ReadingView<W extends Reading> extends WidgetView<W> {
  readonly state = reactive({ entry: null as SourceEntry | null });

  override onBuilt() {
    super.onBuilt();
    const source = this.widget.source;
    if (source === undefined) return;
    // the parameters follow the panel's state; the lookup itself must not be tracked, it records the read
    const stop = effect(() => {
      const params = this.resolve(this.widget.params);
      this.state.entry = untracked(() => this.scope.model.entry(this.scope.panel, source, params));
    });
    this.motif.setDisposable(stop);
  }

  value = () => fieldOf(this.state.entry?.value, this.widget.field);
  error = () => this.state.entry?.error ?? '';
  loading = () => this.state.entry?.status === 'loading' && this.state.entry.value === undefined;
}

export type ViewClass = new () => WidgetView;

/** A plain box that holds the widgets a container builds into it. */
export function host(className: string): Component<HTMLDivElement> {
  const box = new Component<HTMLDivElement>('div');
  box.class.add(className);
  return box;
}
