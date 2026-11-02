import { effect, reactive } from '@motifx/core';
import { laneColour, laneMarkup, type LaneItem } from '../lanes';
import type { TimelineLane, TimelineWidget } from '../schema';
import { axisTicks, formatSpan } from '../timeline';
import { ReadingView, fieldOf, formatText, matches, rowsOf, type ViewClass } from './base';

export const WINDOWS = [10_000, 30_000, 60_000, 300_000];
const DEFAULT_WINDOW = 60_000;
const TICK = 1000;

/** Rows of a source placed in time, in lanes; the right edge follows the present while the widget is live. */
class TimelineView extends ReadingView<TimelineWidget> {
  readonly view_ = reactive({ now: Date.now(), span: DEFAULT_WINDOW });
  private ids = new Map<string, unknown>();
  private rows = new Map<string, unknown>();

  override onConfigured() {
    this.class.add('dt-w');
    this.class.add('dt-w-timeline');
    if (this.widget.open !== undefined) this.class.add('openable');
    if (typeof this.widget.window === 'number' && this.widget.window > 0) this.view_.span = this.widget.window;
  }

  override onBuilt() {
    super.onBuilt();
    if (this.widget.live === false) return;
    const timer = setInterval(() => (this.view_.now = Date.now()), TICK);
    this.motif.setDisposable(() => clearInterval(timer));
    const stop = effect(() => {
      // a new reading moves the right edge at once, not a second later
      void this.state.entry?.value;
      this.view_.now = Date.now();
    });
    this.motif.setDisposable(stop);
  }

  items = (): LaneItem[] => {
    const values = this.scope.panel.values;
    let rows = rowsOf(this.value());
    for (const filter of this.widget.filters ?? []) {
      const wanted = values[filter.state];
      rows = rows.filter((row) => matches(fieldOf(row, filter.field), wanted));
    }
    const ids = new Map<string, unknown>();
    const data = new Map<string, unknown>();
    const items: LaneItem[] = [];
    rows.forEach((row, index) => {
      const start = fieldOf(row, this.widget.itemTime);
      if (typeof start !== 'number') return;
      const duration = this.widget.itemDuration === undefined ? undefined : fieldOf(row, this.widget.itemDuration);
      const id = this.widget.key === undefined ? index : (fieldOf(row, this.widget.key) ?? index);
      const key = String(id);
      const status = this.widget.itemStatus === undefined ? '' : formatText(fieldOf(row, this.widget.itemStatus), undefined);
      ids.set(key, id);
      data.set(key, row);
      items.push({
        key,
        id,
        lane: this.widget.itemLane === undefined ? '' : formatText(fieldOf(row, this.widget.itemLane), undefined),
        start,
        end: typeof duration === 'number' && duration > 0 ? start + duration : start,
        title: formatText(fieldOf(row, this.widget.itemTitle), undefined),
        status,
        tone: this.widget.statusTones?.[status],
      });
    });
    this.ids = ids;
    this.rows = data;
    return items;
  };

  lanes = (): TimelineLane[] => {
    if (this.widget.lanes !== undefined && this.widget.lanes.length > 0) return this.widget.lanes;
    const seen = new Map<string, TimelineLane>();
    for (const item of this.items()) if (!seen.has(item.lane)) seen.set(item.lane, { id: item.lane, label: item.lane });
    return seen.size === 0 ? [{ id: '', label: '' }] : [...seen.values()];
  };

  selected = () => (this.widget.select === undefined ? undefined : this.scope.panel.values[this.widget.select]);

  bars = (lane: string) => laneMarkup(this.items(), lane, this.view_.now, this.view_.span, this.selected());

  pick(target: EventTarget | null) {
    const key = (target as HTMLElement | null)?.dataset?.key;
    if (key === undefined || this.widget.select === undefined) return;
    const id = this.ids.get(key);
    const current = this.selected();
    this.scope.model.setValue(this.scope.panel, this.widget.select, current !== undefined && String(current) === key ? undefined : id);
  }

  openBar(target: EventTarget | null) {
    const key = (target as HTMLElement | null)?.dataset?.key;
    if (key === undefined || this.widget.open === undefined || !this.rows.has(key)) return;
    this.scope.model.open(this.scope.panel, this.widget.open, this.rows.get(key));
  }

  setSpan(span: number) {
    this.view_.span = span;
    this.view_.now = Date.now();
  }

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : (this.widget.empty ?? 'Nothing in this window'));

  inWindow = () => {
    const from = this.view_.now - this.view_.span;
    return this.items().some((item) => item.end >= from && item.start <= this.view_.now);
  };

  override view() {
    return (
      <>
        <div class="dt-tl-head">
          <small class="dt-w-title">{this.widget.title ?? ''}</small>
          <div class="dt-tl-windows" role="group" aria-label="Window">
            {WINDOWS.map((span) => (
              <button key={span} type="button" class={() => (this.view_.span === span ? 'dt-tl-window active' : 'dt-tl-window')} onclick={() => this.setSpan(span)}>
                {formatSpan(span)}
              </button>
            ))}
          </div>
        </div>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => !this.inWindow()}>
          {() => this.emptyText()}
        </div>
        <div class="dt-tl-lanes" onclick={(e: Event) => this.pick(e.target)} ondblclick={(e: Event) => this.openBar(e.target)}>
          {this.lanes().map((lane) => (
            <div key={lane.id} class="dt-tl-row">
              <span class="dt-tl-label" title={lane.label}>
                {lane.label}
              </span>
              <div class="dt-tl-lane" style={`--lane: ${laneColour(lane.tone)}`} x-html={() => this.bars(lane.id)}></div>
            </div>
          ))}
        </div>
        <div class="dt-tl-axis">
          {() =>
            axisTicks(this.view_.span).map((tick) => (
              <span key={tick.label} style={`left: ${tick.left.toFixed(3)}%`}>
                {tick.label}
              </span>
            ))
          }
        </div>
      </>
    );
  }
}

export const timelineViews: Record<string, ViewClass> = { timeline: TimelineView };
