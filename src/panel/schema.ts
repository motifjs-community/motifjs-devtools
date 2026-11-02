// What a package may put in a panel's metadata; the panel draws it, the core only stores it.
// Every value is plain data: no functions, no templates, no code.

export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export type Format = 'number' | 'ms' | 'bytes' | 'date' | 'time' | 'relative' | 'json' | 'component';

/** A literal, a value of the panel's state or a parameter of the open route. */
export type Param = string | number | boolean | null | { state: string } | { param: string };

export type Params = Record<string, Param>;

/** A `Param`, or a field of the row the user opened. */
export type RowParam = Param | { field: string };

/** Opens a route of the panel from a row (a double click); `{ field }` reads the row, the rest resolves as `Params` do. */
export type OpenRoute = { route: string; params?: Record<string, RowParam> };

/** Goes to a route of the panel. */
export type Navigate = { route: string; params?: Params };

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

/** Runs a command of the package (`command`, needs the panel's `write`) or goes to a route of the panel (`navigate`). */
export type ButtonWidget = Common & { type: 'button'; label: string; icon?: string; tone?: Tone; command?: string; args?: Params; confirm?: string; refresh?: string[]; navigate?: Navigate };

export type FilterOption = string | number | boolean | { value: string | number | boolean; label: string };

export type FilterOptions = FilterOption[] | { source: string; params?: Params; itemValue: string; itemLabel?: string };

/** Writes what the user types or picks into the panel's state, where other widgets read it. */
export type FilterWidget = Common & { type: 'filter'; kind: 'search' | 'select' | 'toggle'; state: string; label?: string; placeholder?: string; options?: FilterOptions };

export type TableWidget = Common & Reads & { type: 'table'; key?: string; columns: Column[]; select?: string; open?: OpenRoute; filters?: RowFilter[]; sort?: { field: string; dir?: 'asc' | 'desc' }; height?: number; empty?: string };

export type TreeWidget = Common & Reads & { type: 'tree'; key?: string; itemTitle: string; itemChildren: string; itemBadge?: string; select?: string; open?: OpenRoute; filters?: RowFilter[]; height?: number; empty?: string };

/** A section of a detail: a field by name, or a field with how to show it. */
export type DetailSection = string | { field: string; title?: string; view?: 'auto' | 'fields' | 'table' | 'code' | 'json' | 'value'; columns?: Column[]; format?: Format };

export type DetailWidget = Common & Reads & { type: 'detail'; sections: DetailSection[]; actions?: ButtonWidget[]; empty?: string };

/** Rows of a source as a stream of lines, newest first unless said otherwise. */
export type LogWidget = Common & Reads & { type: 'log'; itemTime?: string; itemTitle: string; itemLevel?: string; levelTones?: Record<string, Tone>; open?: OpenRoute; filters?: RowFilter[]; newestFirst?: boolean; height?: number; empty?: string };

export type TimelineLane = { id: string; label: string; tone?: Tone };

/** Rows of a source in time: a bar when the row has a duration, a dot otherwise; lanes split them by a field. */
export type TimelineWidget = Common & Reads & {
  type: 'timeline';
  itemTime: string;
  itemDuration?: string;
  itemTitle: string;
  itemStatus?: string;
  statusTones?: Record<string, Tone>;
  itemLane?: string;
  lanes?: TimelineLane[];
  key?: string;
  select?: string;
  open?: OpenRoute;
  filters?: RowFilter[];
  /** The span shown, in ms; 60 000 unless given. */
  window?: number;
  /** Keeps the right edge at the present and redraws every second; on unless given. */
  live?: boolean;
  empty?: string;
};

/** A lane of the Performance timeline fed by an event of the package: its time is the event's, the rest comes from the payload. */
export type PerformanceLane = TimelineLane & { event: string; itemDuration?: string; itemTitle?: string };

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
  | ChartWidget
  | LogWidget
  | TimelineWidget;

export type PanelCapabilities = { read?: boolean; subscribe?: boolean; write?: boolean };

/**
 * A view inside the panel, opened by a button's `navigate`, a row's `open` or the package's `reveal`. Its widgets
 * read the route's parameters with `{ param }`; the title is fixed or a field of `source` read with `params`.
 */
export type PanelRoute = { id: string; title?: string | { field: string }; source?: string; params?: Params; layout: Widget };

export type PanelMetadata = {
  id: string;
  title: string;
  icon?: string;
  order?: number;
  capabilities?: PanelCapabilities;
  layout: Widget;
  routes?: PanelRoute[];
  /** Lanes this package adds to the Performance timeline. */
  lanes?: PerformanceLane[];
};
