import type { Tone } from './schema';
import { escapeHtml, formatDuration } from './timeline';

/** One thing on a lane: a bar from `start` to `end`, or a dot when they are the same. */
export type LaneItem = { key: string; id: unknown; lane: string; start: number; end: number; title: string; status: string; tone: Tone | undefined };

const LANE_TONES: Record<string, string> = { accent: 'var(--dt-accent)', info: 'var(--dt-accent)', success: 'var(--dt-ok)', warning: 'var(--dt-warn)', danger: 'var(--dt-danger)', muted: 'var(--dt-muted)' };

export const laneColour = (tone: Tone | undefined) => LANE_TONES[tone ?? 'accent'];

const toneClass = (tone: Tone | undefined) => (tone === undefined ? '' : ` tone-${tone}`);

/** The bars of one lane as markup; `end` is the right edge, `span` the width in ms. */
export function laneMarkup(items: readonly LaneItem[], lane: string, end: number, span: number, selected: unknown): string {
  const from = end - span;
  let html = '';
  for (const item of items) {
    if (item.lane !== lane || item.end < from || item.start > end) continue;
    const left = Math.max(0, ((item.start - from) / span) * 100);
    const right = Math.min(100, ((item.end - from) / span) * 100);
    const dot = item.end === item.start;
    const chosen = selected !== undefined && selected !== null && (Object.is(selected, item.id) || String(selected) === String(item.id));
    const title = [item.title, item.status, dot ? '' : formatDuration(item.end - item.start)].filter((part) => part !== '').join(' · ');
    html += `<span class="dt-tl-bar${dot ? ' dot' : ''}${toneClass(item.tone)}${chosen ? ' open' : ''}" data-key="${escapeHtml(item.key)}" style="left:${left.toFixed(3)}%;width:${Math.max(0, right - left).toFixed(3)}%" title="${escapeHtml(title)}"></span>`;
  }
  return html;
}
