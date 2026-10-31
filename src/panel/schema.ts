// What a package may put in a panel's metadata; the panel draws it, the core only stores it.
// Every value is plain data: no functions, no templates, no code.

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export type Format = 'number' | 'ms' | 'bytes' | 'date' | 'time' | 'relative' | 'json' | 'component';

/** A literal, a value of the panel's state or a route parameter. */
export type Param = string | number | boolean | null | { state: string } | { param: string };

export type Params = Record<string, Param>;

type Common = { title?: string; when?: { state: string } };

type Reads = { source: string; params?: Params; field?: string };

export type StackWidget = Common & { type: 'stack'; direction?: 'column' | 'row'; children: Widget[] };

export type ToolbarWidget = Common & { type: 'toolbar'; children: Widget[] };

export type TextWidget = Common & Partial<Reads> & { type: 'text'; text?: string; format?: Format; tone?: Tone; empty?: string };

export type CounterWidget = Common & Reads & { type: 'counter'; label: string; format?: Format; tone?: Tone };

export type JsonWidget = Common & Reads & { type: 'json'; empty?: string };

export type ButtonWidget = Common & { type: 'button'; label: string; icon?: string; tone?: Tone; command: string; args?: Params; confirm?: string; refresh?: string[] };

export type Widget = StackWidget | ToolbarWidget | TextWidget | CounterWidget | JsonWidget | ButtonWidget;

export type PanelCapabilities = { read?: boolean; subscribe?: boolean; write?: boolean };

export type PanelRoute = { id: string; title?: string | { field: string }; source?: string; params?: Params; layout: Widget };

export type PanelMetadata = {
  id: string;
  title: string;
  icon?: string;
  order?: number;
  capabilities?: PanelCapabilities;
  layout: Widget;
  routes?: PanelRoute[];
};
