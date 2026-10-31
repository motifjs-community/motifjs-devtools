import type { ChartWidget } from '../schema';
import { ReadingView, fieldOf, formatText, rowsOf, toneClass, type ViewClass } from './base';
import { formatClock } from '../format';

const WIDTH = 400;
const HEIGHT = 120;
const SPARK_HEIGHT = 32;
const PAD = { left: 36, right: 8, top: 8, bottom: 18 };
const SERIES = ['var(--dt-accent)', 'var(--dt-ok)', 'var(--dt-warn)', 'var(--dt-danger)', 'var(--dt-purple)'];

type Point = { x: number; y: number };

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const axisX = (value: number) => (value > 1e11 ? formatClock(value) : value.toLocaleString('en-US'));

/** The rows of a source as points per series, within the window the widget asks for. */
export function pointsOf(widget: ChartWidget, value: unknown): { series: Point[][]; names: string[] } {
  let rows = rowsOf(value);
  if (typeof widget.window === 'number' && widget.window > 0) rows = rows.slice(-widget.window);
  const names = widget.series === undefined ? ['value'] : Array.isArray(widget.series) ? widget.series : [widget.series];
  const xOf = (row: unknown, index: number) => (widget.itemX === undefined ? index : (number(fieldOf(row, widget.itemX)) ?? index));
  if (typeof widget.window === 'object' && widget.window !== null && widget.itemX !== undefined) {
    const since = Date.now() - widget.window.seconds * 1000;
    rows = rows.filter((row, index) => xOf(row, index) >= since);
  }
  const series = names.map((name) =>
    rows.flatMap((row, index) => {
      const y = number(widget.series === undefined ? row : fieldOf(row, name));
      return y === null ? [] : [{ x: xOf(row, index), y }];
    }),
  );
  return { series, names };
}

/** The SVG of the chart as text; the panel owns the colours through its tokens. */
export function chartSvg(widget: ChartWidget, value: unknown): string {
  const { series } = pointsOf(widget, value);
  const kind = widget.kind ?? 'line';
  const height = widget.height ?? (kind === 'spark' ? SPARK_HEIGHT : HEIGHT);
  const pad = kind === 'spark' ? { left: 1, right: 1, top: 1, bottom: 1 } : PAD;
  const points = series.flat();
  if (points.length === 0) return '';
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const innerW = WIDTH - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const px = (x: number) => pad.left + ((x - minX) / spanX) * innerW;
  const py = (y: number) => pad.top + innerH - ((y - minY) / spanY) * innerH;
  const parts: string[] = [];
  if (kind !== 'spark') {
    parts.push(`<line class="dt-chart-axis" x1="${pad.left}" y1="${py(minY)}" x2="${WIDTH - pad.right}" y2="${py(minY)}"/>`);
    parts.push(`<text class="dt-chart-label" x="${pad.left - 4}" y="${pad.top + 4}" text-anchor="end">${escape(formatText(maxY, widget.format ?? 'number'))}</text>`);
    parts.push(`<text class="dt-chart-label" x="${pad.left - 4}" y="${py(minY)}" text-anchor="end">${escape(formatText(minY, widget.format ?? 'number'))}</text>`);
    parts.push(`<text class="dt-chart-label" x="${pad.left}" y="${height - 4}">${escape(axisX(minX))}</text>`);
    parts.push(`<text class="dt-chart-label" x="${WIDTH - pad.right}" y="${height - 4}" text-anchor="end">${escape(axisX(maxX))}</text>`);
  }
  series.forEach((line, index) => {
    const colour = widget.tone !== undefined && series.length === 1 ? 'currentColor' : SERIES[index % SERIES.length];
    if (kind === 'bar') {
      const slot = innerW / Math.max(1, line.length);
      const width = Math.max(1, (slot * 0.7) / series.length);
      line.forEach((p, i) => {
        const x = pad.left + i * slot + (slot - width * series.length) / 2 + index * width;
        parts.push(`<rect x="${x.toFixed(1)}" y="${py(p.y).toFixed(1)}" width="${width.toFixed(1)}" height="${(py(minY) - py(p.y)).toFixed(1)}" fill="${colour}"><title>${escape(formatText(p.y, widget.format))}</title></rect>`);
      });
      return;
    }
    const path = line.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${path}" fill="none" stroke="${colour}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`);
  });
  return `<svg viewBox="0 0 ${WIDTH} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="${escape(widget.label ?? 'chart')}">${parts.join('')}</svg>`;
}

class ChartView extends ReadingView<ChartWidget> {
  override onConfigured() {
    this.class.add('dt-w');
    this.class.add(`dt-w-chart${toneClass(this.widget.tone)}`);
    if ((this.widget.kind ?? 'line') === 'spark') this.class.add('spark');
  }

  svg = () => chartSvg(this.widget, this.value());

  emptyText = () => (this.error() !== '' ? this.error() : this.loading() ? 'Loading…' : 'No data');

  override view() {
    return (
      <>
        <small class="dt-w-title" x-display={() => this.widget.title !== undefined || this.widget.label !== undefined}>{this.widget.title ?? this.widget.label ?? ''}</small>
        <div class={() => (this.error() !== '' ? 'dt-w-empty dt-w-error' : 'dt-w-empty dt-muted')} x-display={() => this.svg() === ''}>
          {() => this.emptyText()}
        </div>
        <div class="dt-chart" x-html={() => this.svg()}></div>
      </>
    );
  }
}

export const chartViews: Record<string, ViewClass> = { chart: ChartView };
