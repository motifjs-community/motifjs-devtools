import { Component, FromService } from '@motifx/core';
import { formatClock as clock, formatMs as ms } from '../format';
import { DevtoolsModel } from '../model/DevtoolsModel';
import {
  KINDS,
  kindLabel,
  PerformanceModel,
  WINDOWS,
  type KindFilter,
  type Range,
  type TimelineEntry,
  type TypeStat,
} from '../model/PerformanceModel';
import { StoresModel } from '../model/StoresModel';
import { axisTicks, describeEntry, formatBytes, formatDuration, formatSpan, integer, laneBars, lineChart, rangeStyle } from '../timeline';
import { triggerText } from './ReactivityPage';

const DRAG_THRESHOLD = 3;

const pauseText = (paused: boolean) => (paused ? '▶ Resume' : '❚❚ Pause');
const liveText = (paused: boolean) => (paused ? 'PAUSED' : 'LIVE');
const averageOf = (stat: TypeStat) => stat.total / stat.count;
const rangeText = (range: Range) => `${clock(range.from)} – ${clock(range.to)} (${formatDuration(range.to - range.from)})`;
const listHint = (range: Range | null, shown: number, total: number) => {
  const scope = range === null ? 'Newest first' : 'In the selected range, newest first';
  return total > shown ? `${scope} · ${integer(shown)} of ${integer(total)}` : scope;
};
const heapNote = (memory: boolean | null, limit: number | null | undefined) =>
  memory === false ? 'Chromium browsers only' : limit === null || limit === undefined ? 'Waiting for a sample' : `of ${formatBytes(limit)} limit`;
const outsideNote = (rising: boolean, count: number | undefined) =>
  rising ? 'Rose after each of the last 3 navigations' : count === 0 ? 'Every live component is in the tree' : 'Kept by keepAlive pages or not attached yet';

function StatCard(props: { tone: () => string; label: string; value: () => string; note: () => string }) {
  return (
    <div class={() => `dt-card ${props.tone()}`}>
      <small>{props.label}</small>
      <b>{() => props.value()}</b>
      <span>{() => props.note()}</span>
    </div>
  );
}

function TypeTable(props: { types: () => TypeStat[]; empty: string }) {
  return (
    <div class="dt-perf-table">
      <div class="dt-perf-trow dt-table-head">
        <span>COMPONENT</span>
        <span>COUNT</span>
        <span>AVERAGE</span>
        <span>SLOWEST</span>
      </div>
      <div class="dt-empty small" x-display={() => props.types().length === 0}>
        {props.empty}
      </div>
      {props.types().map((stat) => (
        <div key={stat.type} class="dt-perf-trow">
          <span class="dt-mono">{stat.type}</span>
          <span>{integer(stat.count)}</span>
          <span>{ms(averageOf(stat))}</span>
          <b>{ms(stat.max)}</b>
        </div>
      ))}
    </div>
  );
}

function EntryDetail(props: { entry: TimelineEntry; stores: StoresModel | null }) {
  const { entry, stores } = props;
  if (entry.kind === 'navigation') {
    const facts = [
      ['Address', entry.uri ?? ''],
      ['Requested', entry.requested],
      ['Outcome', entry.outcome ?? '–'],
      ['Reason', entry.reason],
    ].filter((fact): fact is [string, string] => fact[1] !== undefined);
    return (
      <div class="dt-perf-detail">
        <dl class="dt-perf-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd class="dt-mono">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (entry.kind === 'flush') {
    return (
      <div class="dt-perf-detail">
        <small>TRIGGERS</small>
        <ul class="dt-list">
          {(entry.triggers ?? []).map((trigger, index) => (
            <li key={index}>
              <span class="dt-mono">{() => triggerText(trigger, stores)}</span>
              <span class="dt-fill"></span>
              <span class="dt-muted">{`×${trigger.count}`}</span>
            </li>
          ))}
        </ul>
        <span class="dt-muted">Open Reactivity for the effects of each flush.</span>
      </div>
    );
  }
  return (
    <div class="dt-perf-detail">
      <TypeTable types={() => entry.types ?? []} empty="No component recorded." />
      <span class="dt-muted">Durations include the components built inside each one.</span>
    </div>
  );
}

function EntryRow(props: { entry: TimelineEntry; model: PerformanceModel; stores: StoresModel | null }) {
  const { entry, model, stores } = props;
  const open = () => model.state.expanded === entry.id;
  const width = () => {
    const max = model.maxListedDuration;
    return max === 0 ? 0 : Math.max(2, Math.round((entry.duration / max) * 100));
  };
  return (
    <div class={() => (open() ? 'dt-perf-entry open' : 'dt-perf-entry')}>
      <button type="button" class="dt-perf-row" onclick={() => model.toggle(entry.id)}>
        <span class="dt-mono dt-muted">{clock(entry.start)}</span>
        <span class={`dt-kind ${entry.kind}`}>{kindLabel(entry.kind)}</span>
        <span class="dt-perf-what">{describeEntry(entry)}</span>
        <b>{formatDuration(entry.duration)}</b>
        <span class="dt-bar">
          <i style={() => `width: ${width()}%`}></i>
        </span>
      </button>
      <div x-wait={() => !open()}>
        <EntryDetail entry={entry} stores={stores} />
      </div>
    </div>
  );
}

export class PerformancePage extends Component<HTMLElement> {
  static override elementTag = 'section';
  devtools = FromService(DevtoolsModel)!;
  model = FromService(PerformanceModel)!;
  stores = FromService(StoresModel);

  override onConfigured() {
    this.class.add('dt-profile');
    this.class.add('dt-perf');
  }

  private startDrag(event: MouseEvent) {
    const m = this.model;
    const track = event.currentTarget as HTMLElement;
    const rect = track.getBoundingClientRect();
    if (event.button !== 0 || rect.width <= 0) return;
    const span = m.state.window;
    const from = m.state.now - span;
    const timeAt = (x: number) => from + Math.min(1, Math.max(0, (x - rect.left) / rect.width)) * span;
    const startX = event.clientX;
    const startTime = timeAt(startX);
    const target = event.target as Element | null;
    let dragging = false;
    const move = (e: MouseEvent) => {
      if (!dragging && Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return;
      dragging = true;
      m.select(startTime, timeAt(e.clientX));
    };
    const up = (e: MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (dragging) return;
      const id = Number((target?.closest('[data-id]') as HTMLElement | null)?.dataset.id);
      if (Number.isInteger(id) && id > 0) m.focus(id);
      else if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD) m.clearSelection();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    event.preventDefault();
  }

  override view() {
    const d = this.devtools;
    const m = this.model;
    const stores = this.stores;
    const counters = () => d.state.counters;
    const latest = () => m.latest;
    const navigationEnds = () => m.state.entries.filter((e) => e.kind === 'navigation').map((e) => e.end);
    const heapChart = () =>
      lineChart(
        m.state.samples.filter((s) => s.used !== null).map((s) => ({ at: s.at, value: s.used! })),
        m.state.now,
        m.chartSpan,
        'heap',
        navigationEnds(),
      );
    const outsideChart = () =>
      lineChart(
        m.state.samples.filter((s) => s.notInTree !== null).map((s) => ({ at: s.at, value: s.notInTree! })),
        m.state.now,
        m.chartSpan,
        m.rising ? 'outside warn' : 'outside',
        navigationEnds(),
      );
    return (
      <>
        <header class="dt-page-head">
          <div>
            <small>RUNTIME PROFILE</small>
            <h1>Performance</h1>
          </div>
          <div class="dt-page-actions">
            <button type="button" class="dt-button" onclick={() => m.togglePause()}>
              {() => pauseText(m.state.paused)}
            </button>
            <button type="button" class="dt-button primary" onclick={() => m.clear()}>
              Clear recording
            </button>
          </div>
        </header>

        <div class="dt-cards">
          <StatCard tone={() => 'blue'} label="JS HEAP" value={() => formatBytes(latest()?.used)} note={() => heapNote(m.state.memory, latest()?.limit)} />
          <StatCard tone={() => 'purple'} label="COMPONENTS" value={() => integer(counters()?.components.live)} note={() => `${integer(counters()?.components.inTree)} in the tree`} />
          <StatCard tone={() => (m.rising ? 'warn' : 'plain')} label="NOT IN THE TREE" value={() => integer(counters()?.components.notInTree)} note={() => outsideNote(m.rising, counters()?.components.notInTree)} />
          <StatCard tone={() => 'green'} label="RELEASED STORES" value={() => integer(stores?.releasedCount)} note={() => 'Waiting for garbage collection'} />
        </div>

        <div class="dt-panel dt-perf-section">
          <div class="dt-panel-head">
            <div>
              <b>Memory and cleanup</b>
              <small>Up to the last 5 minutes, sampled every 2 seconds. Dashed lines are navigations.</small>
            </div>
          </div>
          <div class="dt-perf-charts">
            <div class="dt-perf-chart">
              <div class="dt-perf-chart-head">
                <b>JS heap used</b>
                <span class="dt-mono">{() => formatBytes(latest()?.used)}</span>
              </div>
              <div class="dt-empty small" x-display={() => m.state.memory === false}>
                The browser does not report heap size. Chrome and Edge do.
              </div>
              <div class="dt-perf-plot" x-display={() => m.state.memory !== false} x-html={heapChart}></div>
            </div>
            <div class="dt-perf-chart">
              <div class="dt-perf-chart-head">
                <b>Components not in the tree</b>
                <span class="dt-mono">{() => integer(latest()?.notInTree)}</span>
              </div>
              <div class="dt-perf-plot" x-html={outsideChart}></div>
              <p class="dt-perf-warning" x-display={() => m.rising}>
                The count rose after each of the last 3 navigations. If no keepAlive page keeps these components, they
                may not be disposed.
              </p>
            </div>
          </div>
        </div>

        <div class="dt-panel dt-perf-section">
          <div class="dt-panel-head">
            <div>
              <b>Timeline</b>
              <small>Drag across the lanes to select a range, click a bar to open it.</small>
            </div>
            <div class="dt-perf-head-actions">
              <div class="dt-segment" role="group" aria-label="Time window">
                {WINDOWS.map((window) => (
                  <button key={window} type="button" class={() => (m.state.window === window ? 'active' : '')} onclick={() => m.setWindow(window)}>
                    {formatSpan(window)}
                  </button>
                ))}
              </div>
              <span class={() => (m.state.paused ? 'dt-live paused' : 'dt-live')}>{() => liveText(m.state.paused)}</span>
            </div>
          </div>
          <div class="dt-tl">
            <div class="dt-tl-labels">
              {KINDS.map((kind) => (
                <span key={kind} class={`dt-tl-label ${kind}`}>
                  {kindLabel(kind)}
                </span>
              ))}
            </div>
            <div class="dt-tl-tracks" onmousedown={(e) => this.startDrag(e as MouseEvent)}>
              {KINDS.map((kind) => (
                <div key={kind} class="dt-tl-lane" x-html={() => laneBars(m.state.entries, kind, m.state.now, m.state.window, m.state.expanded)}></div>
              ))}
              <div class="dt-tl-range" style={() => rangeStyle(m.state.selection, m.state.now, m.state.window)}></div>
            </div>
            <span></span>
            {WINDOWS.map((window) => (
              <div key={window} class="dt-tl-axis" x-display={() => m.state.window === window}>
                {axisTicks(window).map((tick) => (
                  <span key={tick.label} style={`left: ${tick.left}%`}>
                    {tick.label}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div class="dt-tl-selection" x-display={() => m.state.selection !== null}>
            <span>Selected</span>
            <b class="dt-mono">{() => (m.state.selection === null ? '' : rangeText(m.state.selection))}</b>
            <button type="button" class="dt-link" onclick={() => m.clearSelection()}>
              Clear selection
            </button>
          </div>
        </div>

        <div class="dt-panel dt-perf-section">
          <div class="dt-panel-head">
            <div>
              <b>Events</b>
              <small>{() => listHint(m.state.selection, m.listed.length, m.listedTotal)}</small>
            </div>
            <label class="dt-filter" title="Filter by kind">
              <select aria-label="Filter by kind" value={() => m.state.kind} onchange={(e) => m.setKind((e.target as HTMLSelectElement).value as KindFilter)}>
                <option value="all">All kinds</option>
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div class="dt-perf-row dt-table-head">
            <span>START</span>
            <span>KIND</span>
            <span>WHAT</span>
            <span>DURATION</span>
            <span></span>
          </div>
          <div class="dt-empty small" x-display={() => m.listed.length === 0}>
            Nothing recorded yet. Use the app: navigate, change state, open and close pages.
          </div>
          {m.listed.map((entry) => (
            <EntryRow key={entry.id} entry={entry} model={m} stores={stores} />
          ))}
        </div>

        <div class="dt-perf-slowest">
          <div class="dt-panel">
            <div class="dt-panel-head">
              <div>
                <b>Slowest components</b>
                <small>Build time by type, including the components inside</small>
              </div>
            </div>
            <TypeTable types={() => m.slowestTypes} empty="No build recorded." />
          </div>
          <div class="dt-panel">
            <div class="dt-panel-head">
              <div>
                <b>Longest flushes</b>
                <small>Reactivity cycles</small>
              </div>
            </div>
            <div class="dt-empty small" x-display={() => m.longestFlushes.length === 0}>
              No flush recorded.
            </div>
            {m.longestFlushes.map((entry) => (
              <button key={entry.id} type="button" class="dt-perf-top" onclick={() => m.focus(entry.id)}>
                <span class="dt-mono dt-muted">{clock(entry.start)}</span>
                <span>{describeEntry(entry)}</span>
                <b>{formatDuration(entry.duration)}</b>
              </button>
            ))}
          </div>
          <div class="dt-panel">
            <div class="dt-panel-head">
              <div>
                <b>Longest navigations</b>
                <small>From start to the page shown</small>
              </div>
            </div>
            <div class="dt-empty small" x-display={() => m.longestNavigations.length === 0}>
              No navigation recorded.
            </div>
            {m.longestNavigations.map((entry) => (
              <button key={entry.id} type="button" class="dt-perf-top" onclick={() => m.focus(entry.id)}>
                <span class="dt-mono dt-muted">{clock(entry.start)}</span>
                <span class="dt-mono">{describeEntry(entry)}</span>
                <b>{formatDuration(entry.duration)}</b>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }
}
