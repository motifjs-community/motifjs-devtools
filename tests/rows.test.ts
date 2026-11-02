import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX, MAX_ROWS, changeRows, maxOf, trimRows } from '../src/panel/model/rows';

const rows = () => [
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
];

describe('rows of a source', () => {
  it('upsert replaces the row with the same key and adds one it has not seen', () => {
    const list = rows();
    changeRows(list, { key: 'id' }, 'upsert', { id: 2, name: 'two again' });
    changeRows(list, { key: 'id' }, 'upsert', { id: '3', name: 'three' });
    changeRows(list, { key: 'id' }, 'upsert', { id: 3, name: 'three again' });
    expect(list).toEqual([
      { id: 1, name: 'one' },
      { id: 2, name: 'two again' },
      { id: 3, name: 'three again' },
    ]);
  });

  it('upsert without a key, and append, add at the end', () => {
    const list = rows();
    changeRows(list, {}, 'upsert', { id: 1, name: 'again' });
    changeRows(list, { key: 'id' }, 'append', { id: 1, name: 'twice' });
    expect(list.map((row) => (row as { name: string }).name)).toEqual(['one', 'two', 'again', 'twice']);
  });

  it('remove takes away the rows with the key, given as a row or as the key itself', () => {
    const list = [...rows(), { id: 1, name: 'dup' }];
    changeRows(list, { key: 'id' }, 'remove', { id: 1 });
    expect(list).toEqual([{ id: 2, name: 'two' }]);
    changeRows(list, { key: 'id' }, 'remove', '2');
    expect(list).toEqual([]);
  });

  it('drops the truncated marker of a read once the rows change by events', () => {
    const list: unknown[] = [...rows(), { $motif: 'truncated', remaining: 10 }];
    changeRows(list, { key: 'id' }, 'append', { id: 9 });
    expect(list).toEqual([...rows(), { id: 9 }]);
  });

  it('keeps the newest rows up to the limit of the source', () => {
    const list = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    trimRows(list, { max: 3 });
    expect(list.map((row) => row.id)).toEqual([2, 3, 4]);
    changeRows(list, { key: 'id', max: 3 }, 'append', { id: 5 });
    expect(list.map((row) => row.id)).toEqual([3, 4, 5]);
    expect(maxOf({})).toBe(DEFAULT_MAX);
    expect(maxOf({ max: 10 ** 9 })).toBe(MAX_ROWS);
  });
});
