import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON, DEFAULT_ORDER, describePanel, parseExtension } from '../src/panel/model/panels';

const wire = (panels: unknown[], rest: Record<string, unknown> = {}) => ({ panels, sources: {}, commands: [], ...rest });

describe('panel metadata', () => {
  it('keeps a well-formed panel and fills the defaults', () => {
    const parsed = parseExtension(wire([{ id: 'actions', title: 'Actions', layout: { type: 'json', source: 'rows' } }]));
    expect(parsed.panels).toEqual([
      { id: 'actions', title: 'Actions', icon: DEFAULT_ICON, order: DEFAULT_ORDER, capabilities: { read: false, subscribe: false, write: false }, layout: { type: 'json', source: 'rows' }, routes: [], error: null },
    ]);
  });

  it('reads capabilities as true only, the icon and the order as given', () => {
    const [panel] = parseExtension(wire([{ id: 'a', title: 'A', icon: 'chart', order: 12, capabilities: { read: true, write: 'yes' }, layout: { type: 'text', text: 'hi' } }])).panels;
    expect(panel.capabilities).toEqual({ read: true, subscribe: false, write: false });
    expect(panel.icon).toBe('chart');
    expect(panel.order).toBe(12);
  });

  it('keeps a bad panel in its place with an error and no layout', () => {
    const parsed = parseExtension(wire([{ id: 'Bad Id', title: 'Bad', layout: { type: 'text' } }, { id: 'ok', layout: { type: 'stack', children: [{ nope: true }] } }, 'what', { id: 'ok', title: 'Again', layout: { type: 'text' } }]));
    expect(parsed.panels.map((panel) => [panel.id, panel.title, panel.error, panel.layout])).toEqual([
      ['Bad Id', 'Bad', 'invalid id "Bad Id": letters a-z, digits and dashes, at most 40', null],
      ['ok', 'ok', 'invalid layout', null],
      ['panel-3', 'panel-3', 'panel is not an object', null],
      ['ok', 'Again', 'duplicate id "ok"', null],
    ]);
  });

  it('keeps only the routes that are whole', () => {
    const [panel] = parseExtension(wire([{ id: 'a', title: 'A', layout: { type: 'text' }, routes: [{ id: 'item', title: { field: 'name' }, source: 'one', params: { id: { param: 'id' } }, layout: { type: 'json', source: 'one' } }, { id: 'broken' }, { id: 'Bad', layout: { type: 'text' } }] }])).panels;
    expect(panel.routes).toEqual([{ id: 'item', title: { field: 'name' }, source: 'one', params: { id: { param: 'id' } }, layout: { type: 'json', source: 'one' } }]);
  });

  it('keeps the source settings it understands and the command names', () => {
    const parsed = parseExtension(wire([], { sources: { rows: { key: 'id', events: { 'row:added': 'upsert', 'row:odd': 'explode' }, max: 50 }, one: { max: -1 }, odd: 3 }, commands: ['replay', 7, 'clear'] }));
    expect(parsed.sources).toEqual({ rows: { key: 'id', events: { 'row:added': 'upsert' }, max: 50 }, one: {}, odd: {} });
    expect(parsed.commands).toEqual(['replay', 'clear']);
  });

  it('gives nothing for a value that is not metadata', () => {
    expect(parseExtension(undefined)).toEqual({ panels: [], sources: {}, commands: [] });
    expect(parseExtension('text')).toEqual({ panels: [], sources: {}, commands: [] });
  });

  it('makes a describe panel for a package without panels', () => {
    const panel = describePanel('sortable');
    expect(panel).toMatchObject({ id: 'describe', title: 'sortable', capabilities: { read: true, subscribe: false, write: false }, error: null });
    expect(panel.layout).toMatchObject({ type: 'json', source: '$describe' });
  });
});
