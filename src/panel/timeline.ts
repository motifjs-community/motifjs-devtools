import { formatMs } from './format';
import { KIND_LABELS, type Range, type TimelineEntry, type TimelineKind } from './model/PerformanceModel';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const integer = (value: number | null | undefined) => (value === null || value === undefined ? '–' : value.toLocaleString('en-US'));

const plural = (count: number, one: string, many: string) => `${integer(count)} ${count === 1 ? one : many}`;

export const formatBytes = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '–';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : formatMs(ms));

export const formatSpan = (ms: number) => (ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : `${ms / 1000} s`);

export function describeEntry(entry: TimelineEntry): string {
  switch (entry.kind) {
    case 'navigation':
      return entry.outcome === undefined || entry.outcome === 'done' ? entry.uri ?? '' : `${entry.uri ?? ''} (${entry.outcome})`;
    case 'flush':
      return `${plural(entry.count, 'run', 'runs')}, ${plural(entry.effects ?? 0, 'effect', 'effects')}`;
    default: {
      const types = entry.types ?? [];
      const top = types.length === 0 ? undefined : types.reduce((most, stat) => (stat.count > most.count ? stat : most));
      if (top === undefined) return plural(entry.count, 'component', 'components');
      if (entry.count === 1) return top.type;
      return `${plural(entry.count, 'component', 'components')} · ${top.type} ×${integer(top.count)}`;
    }
  }
}

export const entryTitle = (entry: TimelineEntry) => `${KIND_LABELS[entry.kind]} · ${describeEntry(entry)} · ${formatMs(entry.duration)}`;

export function laneBars(entries: readonly TimelineEntry[], kind: TimelineKind, end: number, span: number, expanded: number | null): string {
  const from = end - span;
  let html = '';
  for (const entry of entries) {
    if (entry.kind !== kind || entry.end < from || entry.start > end) continue;
    const left = Math.max(0, ((entry.start - from) / span) * 100);
    const right = Math.min(100, ((entry.end - from) / span) * 100);
    const open = entry.id === expanded ? ' open' : '';
    html += `<span class="dt-tl-bar ${kind}${open}" data-id="${entry.id}" style="left:${left.toFixed(3)}%;width:${Math.max(0, right - left).toFixed(3)}%" title="${escapeHtml(entryTitle(entry))}"></span>`;
  }
  return html;
}

const TICKS: Record<number, number> = { 10_000: 2_000, 30_000: 5_000, 60_000: 10_000, 300_000: 60_000 };

export function axisTicks(span: number): { left: number; label: string }[] {
  const step = TICKS[span] ?? span / 4;
  const ticks: { left: number; label: string }[] = [];
  const unit = span >= 120_000 ? 60_000 : 1_000;
  const name = unit === 60_000 ? 'min' : 's';
  for (let back = span; back > 0; back -= step) ticks.push({ left: ((span - back) / span) * 100, label: `−${back / unit} ${name}` });
  ticks.push({ left: 100, label: 'now' });
  return ticks;
}

export function rangeStyle(range: Range | null, end: number, span: number): string {
  if (range === null) return 'display: none';
  const from = end - span;
  const left = Math.max(0, ((range.from - from) / span) * 100);
  const right = Math.min(100, ((range.to - from) / span) * 100);
  if (right <= 0 || left >= 100) return 'display: none';
  return `left: ${left.toFixed(3)}%; width: ${Math.max(0.2, right - left).toFixed(3)}%`;
}

const WIDTH = 600;
const HEIGHT = 120;

export type Point = { at: number; value: number };

export function lineChart(points: readonly Point[], end: number, span: number, tone: string, markers: readonly number[] = []): string {
  const from = end - span;
  const visible = points.filter((p) => p.at >= from && p.at <= end);
  const max = Math.max(1, ...visible.map((p) => p.value)) * 1.15;
  const x = (at: number) => (((at - from) / span) * WIDTH).toFixed(1);
  const y = (value: number) => (HEIGHT - (value / max) * HEIGHT).toFixed(1);
  let body = '';
  for (const at of markers) {
    if (at < from || at > end) continue;
    body += `<line class="marker" x1="${x(at)}" x2="${x(at)}" y1="0" y2="${HEIGHT}"/>`;
  }
  if (visible.length > 0) {
    const line = visible.map((p) => `${x(p.at)},${y(p.value)}`).join(' ');
    const first = x(visible[0].at);
    const last = x(visible[visible.length - 1].at);
    body += `<polygon class="area" points="${first},${HEIGHT} ${line} ${last},${HEIGHT}"/>`;
    body += `<polyline class="line" points="${line}"/>`;
  }
  return `<svg class="dt-chart-svg ${tone}" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
}
