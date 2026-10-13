import { Component, FromService } from '@motifx/core';
import { formatClock } from '../format';
import { ICONS } from '../icons';
import { LogsModel, type LevelFilter, type LogEntry, type SerializedError } from '../model/LogsModel';
import { ValueList } from '../ValueList';

const errorOf = (entry: LogEntry) => (entry.error !== null && typeof entry.error === 'object' ? entry.error : null);
const errorName = (entry: LogEntry) => errorOf(entry)?.name ?? '–';
const stackOf = (entry: LogEntry) => {
  const error = errorOf(entry);
  if (error !== null) return error.stack ?? '';
  return typeof entry.error === 'string' ? entry.error : '';
};
const causeOf = (entry: LogEntry) => {
  const cause = errorOf(entry)?.cause as SerializedError | undefined;
  if (cause === undefined || cause === null) return '';
  if (typeof cause === 'string') return cause;
  return cause.name ? `${cause.name}: ${cause.message ?? ''}` : (cause.message ?? '');
};
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const splitText = (model: LogsModel) => `${plural(model.warnings, 'warning')}, ${plural(model.errors, 'error')}`;
const numberOf = (model: LogsModel, entry: LogEntry) => String(model.state.entries.findIndex((e) => e.key === entry.key) + 1).padStart(2, '0');

function LogRow(props: { entry: LogEntry; model: LogsModel }) {
  const { entry, model } = props;
  const open = () => model.state.expanded === entry.key;
  const isError = entry.level === 'error';
  return (
    <div
      class={() => (open() ? 'dt-log-entry open' : 'dt-log-entry')}
      x-display={() => model.state.filter === 'all' || model.state.filter === entry.level}
    >
      <button type="button" class="dt-log-row" onclick={() => model.toggle(entry.key)}>
        <span class="dt-mono dt-muted">{() => numberOf(model, entry)}</span>
        <span class="dt-log-title">{entry.title}</span>
        <span class={`dt-level ${entry.level}`}>{`${entry.level} × ${entry.count}`}</span>
        <span class="dt-log-message dt-mono">{entry.message}</span>
        <span class="dt-chevron" x-html={ICONS.chevron}></span>
      </button>
      <dl class="dt-log-detail" x-display={() => open()}>
        <dt>Count</dt>
        <dd class="dt-mono">{String(entry.count)}</dd>
        <dt>First seen</dt>
        <dd class="dt-mono">{formatClock(entry.firstAt)}</dd>
        <dt>Last seen</dt>
        <dd class="dt-mono">{formatClock(entry.lastAt)}</dd>
        <dt x-display={() => !isError}>Details</dt>
        <dd x-display={() => !isError}>
          <ValueList value={() => entry.details} empty="No details" />
        </dd>
        <dt x-display={() => isError}>Name</dt>
        <dd class="dt-mono" x-display={() => isError}>
          {errorName(entry)}
        </dd>
        <dt x-display={() => causeOf(entry) !== ''}>Cause</dt>
        <dd class="dt-mono" x-display={() => causeOf(entry) !== ''}>
          {causeOf(entry)}
        </dd>
        <dt x-display={() => stackOf(entry) !== ''}>Stack</dt>
        <dd x-display={() => stackOf(entry) !== ''}>
          <pre class="dt-stack">{stackOf(entry)}</pre>
        </dd>
      </dl>
    </div>
  );
}

export class LogsPage extends Component<HTMLElement> {
  static override elementTag = 'section';
  model = FromService(LogsModel)!;

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-logs');
  }

  override view() {
    const m = this.model;
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>RUNTIME DIAGNOSTICS</small>
            <h1>Warnings &amp; errors</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.load()}>
              <span class="dt-button-icon" x-html={ICONS.refresh}></span>
              Refresh
            </button>
          </div>
        </header>

        <div class="dt-panel dt-route-card dt-log-card">
          <span class="dt-route-icon" x-html={ICONS.warning}></span>
          <div class="dt-route-main">
            <b class="dt-route-uri dt-log-total">{() => String(m.state.entries.length)}</b>
            <small>Issues reported</small>
            <span class="dt-log-split dt-muted">{() => splitText(m)}</span>
          </div>
          <span class="dt-route-state">Runtime connected</span>
        </div>

        <div class="dt-panel">
          <div class="dt-panel-head">
            <div>
              <b>Recent activity</b>
              <small>Captured since DevTools was enabled, most recently seen first</small>
            </div>
            <label class="dt-filter" title="Filter by level">
              <span x-html={ICONS.filter}></span>
              <select
                aria-label="Filter by level"
                value={() => m.state.filter}
                onchange={(e) => m.setFilter((e.target as HTMLSelectElement).value as LevelFilter)}
              >
                <option value="all">All levels</option>
                <option value="warning">Warnings</option>
                <option value="error">Errors</option>
              </select>
            </label>
          </div>
          <div class="dt-empty small dt-log-empty" x-display={() => m.visible.length === 0}>
            Nothing reported yet.
          </div>
          {m.state.entries.map((entry) => (
            <LogRow key={entry.key} entry={entry} model={m} />
          ))}
        </div>
      </>
    );
  }
}
