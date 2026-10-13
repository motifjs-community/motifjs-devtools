import { describe, expect, it } from 'vitest';
import { reactive } from '@motifx/core';
import { MARK, MAX_ENTRIES, toTransfer } from '../src/bridge/serialize';

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('toTransfer', () => {
  it('keeps JSON values as they are', () => {
    const value = { a: 1, b: 'x', c: [true, null, { d: 2 }] };
    expect(toTransfer(value)).toEqual(value);
  });

  it('marks values JSON cannot carry', () => {
    const out = toTransfer({
      n: NaN,
      i: -Infinity,
      z: -0,
      b: 10n,
      s: Symbol('tag'),
      f: function format() {},
      d: new Date(0),
      r: /a+/g,
      e: new TypeError('bad'),
      el: document.createElement('section'),
    }) as Record<string, unknown>;
    expect(out).toEqual({
      n: { [MARK]: 'number', value: 'NaN' },
      i: { [MARK]: 'number', value: '-Infinity' },
      z: { [MARK]: 'number', value: '-0' },
      b: { [MARK]: 'bigint', value: '10' },
      s: { [MARK]: 'symbol', value: 'tag' },
      f: { [MARK]: 'function', name: 'format' },
      d: { [MARK]: 'date', value: '1970-01-01T00:00:00.000Z' },
      r: { [MARK]: 'regexp', value: '/a+/g' },
      e: { [MARK]: 'error', name: 'TypeError', message: 'bad' },
      el: { [MARK]: 'node', tag: 'section' },
    });
    expect(roundTrip(out)).toEqual(out);
  });

  it('drops undefined object fields but marks undefined elsewhere', () => {
    expect(toTransfer({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(toTransfer(undefined)).toEqual({ [MARK]: 'undefined' });
    expect(toTransfer([undefined])).toEqual([{ [MARK]: 'undefined' }]);
  });

  it('describes Map, Set and class instances', () => {
    class Cart { items = 2; }
    expect(toTransfer(new Map([['k', 1]]))).toEqual({ [MARK]: 'map', size: 1, entries: [['k', 1]] });
    expect(toTransfer(new Set([1]))).toEqual({ [MARK]: 'set', size: 1, values: [1] });
    expect(toTransfer(new Cart())).toEqual({ [MARK]: 'object', type: 'Cart', keys: 1, value: { items: 2 } });
  });

  it('stops at cycles and at the depth limit', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(toTransfer(a)).toEqual({ name: 'a', self: { [MARK]: 'circular' } });
    expect(toTransfer({ x: { y: [1, 2] } }, 1)).toEqual({ x: { [MARK]: 'object', type: 'Object', keys: 1 } });
    const shared = { v: 1 };
    expect(toTransfer([shared, shared])).toEqual([{ v: 1 }, { v: 1 }]);
  });

  it('does not call getters', () => {
    let calls = 0;
    const value = Object.defineProperty({}, 'lazy', { enumerable: true, get: () => ++calls });
    expect(toTransfer(value)).toEqual({ lazy: { [MARK]: 'getter' } });
    expect(calls).toBe(0);
  });

  it('cuts long collections and wraps an own marker key', () => {
    const list = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => i);
    const out = toTransfer(list) as unknown[];
    expect(out).toHaveLength(MAX_ENTRIES + 1);
    expect(out[MAX_ENTRIES]).toEqual({ [MARK]: 'truncated', remaining: 5 });
    expect(toTransfer({ [MARK]: 'node' })).toEqual({ [MARK]: 'object', type: 'Object', keys: 1, value: { [MARK]: 'node' } });
  });

  it('reads reactive objects and collections', () => {
    const state = reactive({ count: 1, tags: new Set(['a']), byId: new Map([[1, { title: 't' }]]) });
    expect(toTransfer(state)).toEqual({
      count: 1,
      tags: { [MARK]: 'set', size: 1, values: ['a'] },
      byId: { [MARK]: 'map', size: 1, entries: [[1, { title: 't' }]] },
    });
  });
});
