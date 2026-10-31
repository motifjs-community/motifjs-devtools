import { Component, effect, reactive, untracked } from '@motifx/core';
import { MARK } from '../bridge/serialize';
import { formatClock, formatMs, formatPath, formatValue } from './format';
import { iconOf } from './icons';
import type { ExtensionsModel, PanelRecord, SourceEntry } from './model/ExtensionsModel';
import type { ButtonWidget, CounterWidget, Format, JsonWidget, StackWidget, TextWidget, Tone, ToolbarWidget, Widget } from './schema';
import { formatBytes } from './timeline';
import { PropNode, valueId, type ValueEntry, type ValueSource } from './ValueTree';

export type Scope = { panel: PanelRecord; model: ExtensionsModel };

const toneClass = (tone: Tone | undefined) => (tone === undefined ? '' : ` tone-${tone}`);

/** One step into a value as the bridge sent it: plain objects and arrays, or the marked copies of other objects. */
export function entriesOf(value: unknown): ValueEntry[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.map((item, index) => ({ key: String(index), value: item }));
  const record = value as Record<string, unknown>;
  const mark = record[MARK];
  if (mark === 'object' && typeof record.value === 'object' && record.value !== null) return Object.entries(record.value as Record<string, unknown>).map(([key, item]) => ({ key, value: item }));
  if (mark === 'map' && Array.isArray(record.entries)) return record.entries.map((pair) => ({ key: formatValue((pair as unknown[])[0]).text, value: (pair as unknown[])[1] }));
  if (mark === 'set' && Array.isArray(record.values)) return record.values.map((item, index) => ({ key: String(index), value: item }));
  if (typeof mark === 'string') return [];
  return Object.entries(record).map(([key, item]) => ({ key, value: item }));
}

export function fieldOf(value: unknown, field: string | undefined): unknown {
  if (field === undefined || field === '') return value;
  let current = value;
  for (const key of field.split('.')) {
    current = entriesOf(current).find((entry) => entry.key === key)?.value;
    if (current === undefined) return undefined;
  }
  return current;
}

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
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record[MARK] === 'array' && typeof record.length === 'number') return record.length;
    if ((record[MARK] === 'map' || record[MARK] === 'set') && typeof record.size === 'number') return record.size;
  }
  return Number.NaN;
}

abstract class WidgetView<W extends Widget = Widget> extends Component<HTMLDivElement> {
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
}

abstract class ReadingView<W extends TextWidget | CounterWidget | JsonWidget> extends WidgetView<W> {
  readonly state = reactive({ entry: null as SourceEntry | null });

  override onBuilt() {
    super.onBuilt();
    const source = this.widget.source;
    if (source === undefined) return;
    // the parameters follow the panel's state; the lookup itself must not be tracked, it records the read
    const stop = effect(() => {
      const params = this.scope.model.resolve(this.scope.panel, this.widget.params);
      this.state.entry = untracked(() => this.scope.model.entry(this.scope.panel, source, params));
    });
    this.motif.setDisposable(stop);
  }

  value = () => fieldOf(this.state.entry?.value, this.widget.field);
  error = () => this.state.entry?.error ?? '';
  loading = () => this.state.entry?.status === 'loading' && this.state.entry.value === undefined;
}

class StackView extends WidgetView<StackWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-stack');
    if (this.widget.direction === 'row') this.class.add('row');
  }

  override onBuilt() {
    super.onBuilt();
    this.controls.add(...this.widget.children.map((child) => buildWidget(child, this.scope)));
  }
}

class ToolbarView extends WidgetView<ToolbarWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-toolbar');
  }

  override onBuilt() {
    super.onBuilt();
    this.controls.add(...this.widget.children.map((child) => buildWidget(child, this.scope)));
  }
}

class TextView extends ReadingView<TextWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add(`dt-w-text${toneClass(this.widget.tone)}`);
  }

  text = () => {
    if (this.widget.source === undefined) return this.widget.text ?? '';
    const value = this.value();
    if (value === undefined || value === null || value === '') return this.loading() ? '…' : (this.widget.empty ?? '');
    return formatText(value, this.widget.format);
  };

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <span class="dt-w-value">{() => this.text()}</span>
        <span class="dt-w-error" x-display={() => this.error() !== ''}>{() => this.error()}</span>
      </>
    );
  }
}

class CounterView extends ReadingView<CounterWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add(`dt-w-counter${toneClass(this.widget.tone)}`);
  }

  count = () => {
    const count = countOf(this.value());
    return Number.isNaN(count) ? (this.loading() ? '…' : '–') : formatText(count, this.widget.format ?? 'number');
  };

  override view() {
    return (
      <>
        <b class="dt-w-count">{() => this.count()}</b>
        <small class="dt-w-label">{this.widget.label}</small>
        <span class="dt-w-error" x-display={() => this.error() !== ''}>{() => this.error()}</span>
      </>
    );
  }
}

class JsonView extends ReadingView<JsonWidget> {
  private readonly open = reactive({ keys: {} as Record<string, boolean> });

  readonly tree: ValueSource = {
    node: (keys) => {
      if (!this.open.keys[valueId(keys)]) return undefined;
      const value = keys.reduce<unknown>((current, key) => entriesOf(current).find((entry) => entry.key === key)?.value, this.value());
      const entries = entriesOf(value);
      return { entries, total: entries.length };
    },
    toggle: (keys) => {
      const id = valueId(keys);
      this.open.keys[id] = !this.open.keys[id];
    },
  };

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-json');
  }

  entries = () => entriesOf(this.value());

  emptyText = () => {
    if (this.error() !== '') return this.error();
    if (this.loading()) return 'Loading…';
    const value = this.value();
    if (value !== undefined && value !== null && typeof value !== 'object') return formatValue(value).text;
    return this.widget.empty ?? 'Nothing to show';
  };

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.entries().length === 0}>
          {() => this.emptyText()}
        </div>
        {this.entries().map((entry) => (
          <PropNode key={`${entry.key}:${JSON.stringify(entry.value) ?? ''}`} name={entry.key} value={entry.value} keys={[entry.key]} source={this.tree} />
        ))}
      </>
    );
  }
}

class ButtonView extends WidgetView<ButtonWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-button');
  }

  busy = () => this.scope.panel.busy === this.widget.command;
  allowed = () => this.scope.panel.capabilities.write;

  override view() {
    const icon = this.widget.icon === undefined ? '' : iconOf(this.widget.icon, 'play');
    return (
      <button
        type="button"
        class={() => `dt-button${toneClass(this.widget.tone)}${this.busy() ? ' busy' : ''}`}
        disabled={() => this.busy() || !this.allowed()}
        title={() => (this.allowed() ? (this.widget.confirm ?? '') : 'This panel may not run commands')}
        onclick={() => void this.scope.model.run(this.scope.panel, this.widget)}
      >
        <span class="dt-button-icon" x-html={icon} x-display={() => icon !== ''}></span>
        {this.widget.label}
      </button>
    );
  }
}

class UnknownView extends WidgetView<Widget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-unknown');
  }

  override view() {
    return <span>{`A "${this.widget.type}" widget is not supported by this version of the panel.`}</span>;
  }
}

function viewFor(widget: Widget): WidgetView {
  switch (widget.type) {
    case 'stack':
      return new StackView();
    case 'toolbar':
      return new ToolbarView();
    case 'text':
      return new TextView();
    case 'counter':
      return new CounterView();
    case 'json':
      return new JsonView();
    case 'button':
      return new ButtonView();
    default:
      return new UnknownView();
  }
}

/** The component that draws a widget; children of containers are built the same way. */
export function buildWidget(widget: Widget, scope: Scope): Component {
  const view = viewFor(widget);
  view.widget = widget;
  view.scope = scope;
  return view;
}
