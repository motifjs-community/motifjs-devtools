import { describe, expect, it } from 'vitest';
import { mergeNavigation, type NavItem, type NavPanel } from '../src/panel/navigation';

const builtin = (section: string, order: number): NavItem => ({ key: section, section, label: section, icon: '', order, builtin: true, writes: false, broken: false });
const panel = (key: string, title: string, order: number, writes = false): NavPanel => ({ key, title, icon: '', order, writes, broken: false });

const BUILTIN = [builtin('home', 10), builtin('elements', 20), builtin('logs', 80)];

describe('sidebar navigation', () => {
  it('places the panels of packages among the built-in sections by order, built-in first on a tie', () => {
    const items = mergeNavigation(BUILTIN, [panel('ext:a:late', 'Late', 100), panel('ext:a:early', 'Early', 15), panel('ext:b:tie', 'Tie', 20)], new Map());
    expect(items.map((item) => item.key)).toEqual(['home', 'ext:a:early', 'elements', 'ext:b:tie', 'logs', 'ext:a:late']);
  });

  it('sorts panels of the same order by label', () => {
    const items = mergeNavigation([], [panel('ext:b:x', 'Zebra', 100), panel('ext:a:x', 'Apple', 100)], new Map());
    expect(items.map((item) => item.label)).toEqual(['Apple', 'Zebra']);
  });

  it('keeps the item of a panel across rebuilds and updates it in place', () => {
    const known = new Map<string, NavItem>();
    const first = mergeNavigation(BUILTIN, [panel('ext:a:p', 'Panel', 30)], known);
    const item = first.find((entry) => entry.key === 'ext:a:p')!;
    const second = mergeNavigation(BUILTIN, [panel('ext:a:p', 'Renamed', 5, true)], known);
    expect(second.find((entry) => entry.key === 'ext:a:p')).toBe(item);
    expect(item).toMatchObject({ label: 'Renamed', order: 5, writes: true });
    expect(second[0]).toBe(item);
  });

  it('forgets the item of a panel that is gone', () => {
    const known = new Map<string, NavItem>();
    mergeNavigation(BUILTIN, [panel('ext:a:p', 'Panel', 30), panel('ext:a:q', 'Other', 40)], known);
    const items = mergeNavigation(BUILTIN, [panel('ext:a:q', 'Other', 40)], known);
    expect([...known.keys()]).toEqual(['ext:a:q']);
    expect(items.map((item) => item.key)).toEqual(['home', 'elements', 'ext:a:q', 'logs']);
  });
});
