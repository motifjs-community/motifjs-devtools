// What a package may put in a panel's metadata; the panel draws it, the core only stores it.
// Every value is plain data: no functions, no templates, no code.

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export type Format = 'number' | 'ms' | 'bytes' | 'date' | 'time' | 'relative' | 'json' | 'component';

/** A literal, a value of the panel's state or a route parameter. */
export type Param = string | number | boolean | null | { state: string } | { param: string };

export type Params = Record<string, Param>;

type Common = { title?: string; when?: { state: string } };

type Reads = { source: string; params?: Params; field?: string };

export type Column = { field: string; title?: string; format?: Format; width?: number; align?: 'start' | 'end' };

/** A row stays when its field matches what the filter widget wrote into the state: text is searched, other values compared. */
export type RowFilter = { field: string; state: string };

export type StackWidget = Common & { type: 'stack'; direction?: 'column' | 'row'; children: Widget[] };

export type ToolbarWidget = Common & { type: 'toolbar'; children: Widget[] };

/** Two widgets with a divider between them; `size` is the first one's share (a fraction or a percentage). */
export type SplitWidget = Common & { type: 'split'; direction?: 'row' | 'column'; size?: number; primary: Widget; secondary: Widget };

export type TabsWidget = Common & { type: 'tabs'; state?: string; tabs: { title: string; layout: Widget }[] };

export type TextWidget = Common & Partial<Reads> & { type: 'text'; text?: string; format?: Format; tone?: Tone; empty?: string };

export type CounterWidget = Common & Reads & { type: 'counter'; label: string; format?: Format; tone?: Tone };

/** A short label; `tones` picks the tone by the text shown. */
export type BadgeWidget = Common & Partial<Reads> & { type: 'badge'; text?: string; format?: Format; tone?: Tone; tones?: Record<string, Tone> };

export type JsonWidget = Common & Reads & { type: 'json'; empty?: string };

export type CodeWidget = Common & Partial<Reads> & { type: 'code'; text?: string; language?: 'text' | 'json'; empty?: string };

export type ButtonWidget = Common & { type: 'button'; label: string; icon?: string; tone?: Tone; command: string; args?: Params; confirm?: string; refresh?: string[] };

export type FilterOption = string | number | boolean | { value: string | number | boolean; label: string };

export type FilterOptions = FilterOption[] | { source: string; params?: Params; itemValue: string; itemLabel?: string };

/** Writes what the user types or picks into the panel's state, where other widgets read it. */
export type FilterWidget = Common & { type: 'filter'; kind: 'search' | 'select' | 'toggle'; state: string; label?: string; placeholder?: string; options?: FilterOptions };

export type TableWidget = Common & Reads & { type: 'table'; key?: string; columns: Column[]; select?: string; filters?: RowFilter[]; sort?: { field: string; dir?: 'asc' | 'desc' }; height?: number; empty?: string };

export type TreeWidget = Common & Reads & { type: 'tree'; key?: string; itemTitle: string; itemChildren: string; itemBadge?: string; select?: string; filters?: RowFilter[]; height?: number; empty?: string };

/** A section of a detail: a field by name, or a field with how to show it. */
export type DetailSection = string | { field: string; title?: string; view?: 'auto' | 'fields' | 'table' | 'code' | 'json' | 'value'; columns?: Column[]; format?: Format };

export type DetailWidget = Common & Reads & { type: 'detail'; sections: DetailSection[]; actions?: ButtonWidget[]; empty?: string };

/** A small chart over the rows of a source: `series` names the fields drawn, `itemX` the field on the x axis (the index without it). */
export type ChartWidget = Common & Reads & { type: 'chart'; kind?: 'line' | 'bar' | 'spark'; itemX?: string; series?: string | string[]; tone?: Tone; format?: Format; window?: number | { seconds: number }; height?: number; label?: string };

export type Widget =
  | StackWidget
  | ToolbarWidget
  | SplitWidget
  | TabsWidget
  | TextWidget
  | CounterWidget
  | BadgeWidget
  | JsonWidget
  | CodeWidget
  | ButtonWidget
  | FilterWidget
  | TableWidget
  | TreeWidget
  | DetailWidget
  | ChartWidget;

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
