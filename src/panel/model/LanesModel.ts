import { reactive } from '@motifx/core';
import type { Client, ClientEvent } from '../../client/client';
import { formatValue } from '../format';
import type { LaneItem } from '../lanes';
import type { Tone } from '../schema';
import { fieldOf } from '../values';

/** A lane of the Performance timeline, as a package declared it: fed by one of its events. */
export type LaneDef = { key: string; name: string; label: string; tone?: Tone; event: string; itemDuration?: string; itemTitle?: string };

export const MAX_LANE_ENTRIES = 2000;

/** Collects the events the packages' lanes name, as items in time; the Performance page draws them under its own lanes. */
export class LanesModel {
  readonly state = reactive({ entries: [] as LaneItem[] });

  private nextId = 1;
  private readonly off: () => void;

  constructor(
    client: Client,
    readonly lanes: () => LaneDef[],
  ) {
    this.off = client.onEvent((event) => this.receive(event));
  }

  receive(event: ClientEvent) {
    if (!event.type.startsWith('ext:')) return;
    const matching = this.lanes().filter((lane) => lane.event === event.type);
    if (matching.length === 0) return;
    const at = typeof event.time === 'number' ? event.time : Date.now();
    for (const lane of matching) {
      const duration = lane.itemDuration === undefined ? undefined : fieldOf(event.payload, lane.itemDuration);
      const took = typeof duration === 'number' && duration > 0 ? duration : 0;
      const titleValue = lane.itemTitle === undefined ? undefined : fieldOf(event.payload, lane.itemTitle);
      const title = titleValue === undefined ? event.type.slice(`ext:${lane.name}:`.length) : typeof titleValue === 'string' ? titleValue : formatValue(titleValue).text;
      const id = this.nextId++;
      this.state.entries.push({ key: String(id), id, lane: lane.key, start: at - took, end: at, title, status: '', tone: lane.tone });
    }
    const over = this.state.entries.length - MAX_LANE_ENTRIES;
    if (over > 0) this.state.entries.splice(0, over);
  }

  clear() {
    this.state.entries = [];
  }

  dispose() {
    this.off();
  }
}
