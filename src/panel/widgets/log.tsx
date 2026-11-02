import { Virtualization, effect } from '@motifx/core';
import { formatClock } from '../format';
import type { LogWidget } from '../schema';
import { ReadingView, fieldOf, formatText, isTruncated, matches, rowsOf, toneClass, type ViewClass } from './base';
import { ROW_HEIGHT } from './table';

const LOG_HEIGHT = 240;

type Line = { key: string; time: string; title: string; level: string; tone: string };

function LogLine(props: { line: Line }) {
  const { line } = props;
  return (
    <div class="dt-logline" role="row">
      <span class="dt-logline-time dt-mono">{line.time}</span>
      <span class={`dt-chip${line.tone}`} x-display={() => line.level !== ''}>
        {line.level}
      </span>
      <span class="dt-logline-title" title={line.title}>
        {line.title}
      </span>
    </div>
  );
}

/** A stream of lines from a list source, the newest first unless the widget says otherwise. */
class LogView extends ReadingView<LogWidget> {
  readonly list = new Virtualization<Line>({
    itemHeight: ROW_HEIGHT,
    autoRefresh: false,
    className: 'dt-vlist',
    dataRequest: async () => {
      const lines = this.lines();
      return { items: lines, totalCount: lines.length, hasMore: false };
    },
    itemTemplate: (line) => <LogLine line={line} />,
  });

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-log');
    this.element.style.setProperty('--dt-list-height', `${this.widget.height ?? LOG_HEIGHT}px`);
  }

  override onBuilt() {
    super.onBuilt();
    const stop = effect(() => {
      const lines = this.lines();
      queueMicrotask(() => this.list.setData(lines));
    });
    this.motif.setDisposable(stop);
  }

  lines = (): Line[] => {
    const values = this.scope.panel.values;
    let rows = rowsOf(this.value());
    for (const filter of this.widget.filters ?? []) {
      const wanted = values[filter.state];
      rows = rows.filter((row) => matches(fieldOf(row, filter.field), wanted));
    }
    const lines = rows.map((row, index) => {
      const time = this.widget.itemTime === undefined ? undefined : fieldOf(row, this.widget.itemTime);
      const level = this.widget.itemLevel === undefined ? '' : formatText(fieldOf(row, this.widget.itemLevel), undefined);
      return {
        key: `${index}`,
        time: typeof time === 'number' ? formatClock(time) : formatText(time, undefined),
        title: formatText(fieldOf(row, this.widget.itemTitle), undefined),
        level,
        tone: toneClass(this.widget.levelTones?.[level]),
      };
    });
    return this.widget.newestFirst === false ? lines : lines.reverse();
  };

  left = () => isTruncated(this.value());

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'Nothing logged'));

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined}>{this.widget.title ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.lines().length === 0}>
          {() => this.emptyText()}
        </div>
        {this.list}
        <small class="dt-w-more dt-muted" x-display={() => this.left() > 0}>
          {() => `${this.left().toLocaleString('en-US')} more lines were not sent (limit of one read)`}
        </small>
      </>
    );
  }
}

export const logViews: Record<string, ViewClass> = { log: LogView };
