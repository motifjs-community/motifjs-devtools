import { reactive } from '@motifx/core';
import { valueId, type ValueEntry, type ValueSource } from './ValueTree';
import { entriesOf } from './values';

export type LocalTree = ValueSource & { entries: () => ValueEntry[] };

/** A value tree over data the panel already holds: every level is there, opening a node only shows it. */
export function localTree(value: () => unknown): LocalTree {
  const open = reactive({ keys: {} as Record<string, boolean> });
  return {
    entries: () => entriesOf(value()),
    node: (keys) => {
      if (!open.keys[valueId(keys)]) return undefined;
      const found = keys.reduce<unknown>((current, key) => entriesOf(current).find((entry) => entry.key === key)?.value, value());
      const entries = entriesOf(found);
      return { entries, total: entries.length };
    },
    toggle: (keys) => {
      const id = valueId(keys);
      open.keys[id] = !open.keys[id];
    },
  };
}
