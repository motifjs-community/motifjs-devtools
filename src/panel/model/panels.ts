import type { ExtensionSourceSettings } from '../../bridge/protocol';
import type { PanelCapabilities, PanelRoute, Widget } from '../schema';

export const NAME_RULE = /^[a-z0-9-]{1,40}$/;
export const DEFAULT_ORDER = 100;
export const DEFAULT_ICON = 'puzzle';
export const DESCRIBE_SOURCE = '$describe';

const EVENT_ACTIONS = new Set(['upsert', 'append', 'remove', 'refresh']);

export type ParsedPanel = {
  id: string;
  title: string;
  icon: string;
  order: number;
  capabilities: Required<PanelCapabilities>;
  layout: Widget | null;
  routes: PanelRoute[];
  error: string | null;
};

export type ParsedExtension = { panels: ParsedPanel[]; sources: Record<string, ExtensionSourceSettings>; commands: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isWidget = (value: unknown): value is Widget => isRecord(value) && typeof value.type === 'string' && value.type !== '';

/** Every node reachable through `children` must be a widget; the bridge already bounded their number. */
function checkLayout(value: unknown): string | null {
  if (!isWidget(value)) return 'invalid layout';
  const children = (value as { children?: unknown }).children;
  if (children === undefined) return null;
  if (!Array.isArray(children)) return `invalid children of "${value.type}"`;
  for (const child of children) {
    const error = checkLayout(child);
    if (error !== null) return error;
  }
  return null;
}

function parseRoutes(value: unknown): PanelRoute[] {
  if (!Array.isArray(value)) return [];
  const routes: PanelRoute[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !NAME_RULE.test(item.id) || checkLayout(item.layout) !== null) continue;
    const route: PanelRoute = { id: item.id, layout: item.layout as Widget };
    if (typeof item.title === 'string' || (isRecord(item.title) && typeof item.title.field === 'string')) route.title = item.title as PanelRoute['title'];
    if (typeof item.source === 'string') route.source = item.source;
    if (isRecord(item.params)) route.params = item.params as PanelRoute['params'];
    routes.push(route);
  }
  return routes;
}

function parsePanel(value: unknown, index: number, seen: Set<string>): ParsedPanel {
  const record = isRecord(value) ? value : {};
  const rawId = typeof record.id === 'string' ? record.id : `panel-${index + 1}`;
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? record.title : rawId;
  const capabilities = isRecord(record.capabilities) ? record.capabilities : {};
  const panel: ParsedPanel = {
    id: rawId,
    title,
    icon: typeof record.icon === 'string' && record.icon !== '' ? record.icon : DEFAULT_ICON,
    order: typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : DEFAULT_ORDER,
    capabilities: { read: capabilities.read === true, subscribe: capabilities.subscribe === true, write: capabilities.write === true },
    layout: null,
    routes: parseRoutes(record.routes),
    error: null,
  };
  if (!isRecord(value)) panel.error = 'panel is not an object';
  else if (typeof record.id !== 'string' || !NAME_RULE.test(record.id)) panel.error = `invalid id "${rawId}": letters a-z, digits and dashes, at most 40`;
  else if (seen.has(record.id)) panel.error = `duplicate id "${record.id}"`;
  else panel.error = checkLayout(record.layout);
  if (panel.error === null) panel.layout = record.layout as Widget;
  seen.add(panel.id);
  return panel;
}

function parseSources(value: unknown): Record<string, ExtensionSourceSettings> {
  const sources: Record<string, ExtensionSourceSettings> = {};
  if (!isRecord(value)) return sources;
  for (const [name, item] of Object.entries(value)) {
    const settings: ExtensionSourceSettings = {};
    if (isRecord(item)) {
      if (typeof item.key === 'string') settings.key = item.key;
      if (typeof item.max === 'number' && Number.isInteger(item.max) && item.max > 0) settings.max = item.max;
      if (isRecord(item.events)) {
        const events: Record<string, 'upsert' | 'append' | 'remove' | 'refresh'> = {};
        for (const [type, action] of Object.entries(item.events)) if (typeof action === 'string' && EVENT_ACTIONS.has(action)) events[type] = action as 'refresh';
        settings.events = events;
      }
    }
    sources[name] = settings;
  }
  return sources;
}

/** Turns what readExtensionPanels sent into records the panel can trust; a bad panel keeps its place with an error. */
export function parseExtension(wire: unknown): ParsedExtension {
  const record = isRecord(wire) ? wire : {};
  const seen = new Set<string>();
  const panels = Array.isArray(record.panels) ? record.panels.map((panel, index) => parsePanel(panel, index, seen)) : [];
  const commands = Array.isArray(record.commands) ? record.commands.filter((command): command is string => typeof command === 'string') : [];
  return { panels, sources: parseSources(record.sources), commands };
}

/** The panel of a package that gives no panels: what describe() returns, as a value tree. */
export function describePanel(name: string): ParsedPanel {
  return {
    id: 'describe',
    title: name,
    icon: DEFAULT_ICON,
    order: DEFAULT_ORDER,
    capabilities: { read: true, subscribe: false, write: false },
    layout: { type: 'json', source: DESCRIBE_SOURCE, empty: 'describe() gave nothing' },
    routes: [],
    error: null,
  };
}
