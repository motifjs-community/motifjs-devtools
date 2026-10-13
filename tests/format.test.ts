import { describe, expect, it } from 'vitest';
import { formatValue } from '../src/panel/format';

describe('formatValue', () => {
  it('shows a signal by its value and keeps the kind of the value', () => {
    expect(formatValue({ kind: 'signal', type: 'signal', value: 'dark' })).toEqual({ text: 'signal("dark")', kind: 'string' });
    expect(formatValue({ kind: 'signal', type: 'computed', value: 48 })).toEqual({ text: 'computed(48)', kind: 'number' });
    expect(formatValue({ kind: 'signal', type: 'signal', value: { kind: 'object', type: 'Object', keys: 2 } })).toEqual({ text: 'signal(Object {2})', kind: 'object' });
  });

  it('marks a computed that was not computed yet as stale', () => {
    expect(formatValue({ kind: 'signal', type: 'computed', stale: true })).toEqual({ text: 'computed(stale)', kind: 'other' });
    expect(formatValue({ kind: 'signal', type: 'computed', value: { $motif: 'undefined' }, stale: true })).toEqual({ text: 'computed(stale)', kind: 'other' });
    expect(formatValue({ kind: 'signal', type: 'computed', value: 4, stale: true })).toEqual({ text: 'computed(4) stale', kind: 'number' });
  });
});
