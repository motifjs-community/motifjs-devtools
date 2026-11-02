# Panels of packages

A package built on MotifJS can show its own data in the DevTools panel: a section in the sidebar with widgets the
panel draws from plain metadata, sources the panel reads, commands it runs, events that change rows as they happen,
lanes on the Performance timeline, and a way to point the user at something. Nothing of the panel runs in the page
and nothing of the package runs in the panel: the package gives data, the panel draws it. The same package works in
the in-page panel and in the browser extension.

This page is for package authors. It describes what `registerDevtools` takes (a core with contract version 2 and
the extension methods; `@motifx/core` 1.2.0-rc.24 or later), what the panel does with it, and the limits.

## Registering

```ts
import { registerDevtools } from '@motifx/core/devtools';
import type { PanelMetadata } from '@motifx-community/devtools';

const panel: PanelMetadata = { /* see below */ };

const devtools = registerDevtools('action-history', {
  describe: () => history.describe(),                 // a summary of the package, shown in Elements and as a fallback panel
  inspect: (component) => history.ofComponent(component),   // what the package knows about a selected component
  sources: {
    actions: { read: () => history.list(), key: 'id', events: { 'action:start': 'upsert', 'action:end': 'upsert', 'history:cleared': 'refresh' }, max: 5000 },
    selectedAction: { read: ({ id }) => history.get(id) },
  },
  commands: {
    replay: ({ id }) => history.replay(id),
    clear: () => history.clear(),
  },
  panels: [panel],
});

devtools.emit('action:start', { id, name, status: 'running', startedAt: Date.now() });
devtools.changed('actions');                                     // the panel reads the source again
devtools.reveal({ panel: 'actions', state: { actionId: id } });  // the panel shows this action
devtools.dispose();
```

`@motifx-community/devtools` is a type-only import for the package: it gives `PanelMetadata`, `Widget` and every
widget type, and nothing of it is loaded at runtime. The devtools call `read` and the commands only while the panel
is open and connected; `emit` costs nothing while devtools is off.

- **`sources`**: what the panel reads. `read(params)` returns anything JSON can carry (the bridge copies it; a
  value JSON cannot carry is marked). `key` names the field that identifies a row. `events` maps an event type of
  the package to what it does to the rows the panel holds: `upsert` puts the payload in place of the row with the
  same key or adds it, `append` adds it, `remove` takes the row with the payload's key out, `refresh` reads the
  source again. `max` bounds the rows kept, newest last (5000 unless given, 50 000 at most).
- **`commands`**: `(args) => unknown`, run from a panel with `write`. A thrown error becomes the notice under the
  panel's title. A returned promise is awaited.
- **`panels`**: a list of `PanelMetadata`, or a function that returns one. Up to 8.
- **`describe`** and **`inspect`** work without panels: `describe()` shows as a value tree in a panel named after
  the package, read again on every event of the package and on every reactivity flush while it is open; `inspect()`
  shows in the Extensions tab of a selected component in Elements.

## Panel metadata

```ts
type PanelMetadata = {
  id: string;                        // letters a-z, digits and dashes, at most 40; unique in the package
  title: string;
  icon?: string;                     // one of the panel's icons; an unknown name gets the puzzle piece
  order?: number;                    // built-in sections sit at 10, 20 … 80; 100 unless given
  capabilities?: { read?: boolean; subscribe?: boolean; write?: boolean };   // false unless given
  layout: Widget;                    // the panel's own view
  routes?: PanelRoute[];             // views inside the panel
  lanes?: PerformanceLane[];         // lanes this package adds to the Performance timeline
};
```

Icons: `puzzle`, `pen`, `play`, `trash`, `timeline`, `list`, `chart`, `code`, `book`, `bug`, `idea`, `notes`,
`package`, `star`, `home`, `elements`, `performance`, `reactivity`, `router`, `stores`, `services`, `logs`.

**Capabilities** are checked by the core for each panel, not shown by the panel alone:

- `read`: the panel may read the package's sources. Without it, widgets fill from events only.
- `subscribe`: the package's events reach the panel. While no panel of a package has it, the bridge does not copy
  the package's events at all.
- `write`: the panel may run commands. Without it, buttons with a command stay disabled with a hint, and
  `callExtension` is refused. A panel with `write` carries a pen mark in the sidebar and "changes the app" in its
  title.

**Panel state**: every panel has a small object of values. Widgets write into it (`select`, `state`) and read from
it (`{ state: 'key' }`). It is kept while the panel exists, across opening and closing the panel.

**Values (`Param`)**: a widget's `params` and a button's `args` are built from literals, `{ state: 'key' }` (the
panel's state) and `{ param: 'id' }` (a parameter of the open route). A row's `open` also takes `{ field: 'id' }`
(a field of that row). No expressions, no templates, no code.

**Fields** are dotted paths into the value the source gave: `summary.duration`.

## Widgets

Common to every widget: `type`, `title?`, `when?: { state }` (hidden while the value is empty), and for the ones
that read, `source`, `params?` and `field?`. A widget type the panel does not know is drawn as a placeholder; the
rest of the layout stays.

| Widget | What it does | Fields |
| --- | --- | --- |
| `stack` | children one under the other, or side by side | `children`, `direction` (`column`, `row`) |
| `toolbar` | a row of buttons, filters and counters | `children` |
| `split` | two widgets with a divider the user drags | `primary`, `secondary`, `direction` (`row`, `column`), `size` (the first one's share, a fraction or a percentage) |
| `tabs` | tabs over widgets | `tabs: [{ title, layout }]`, `state` (the open tab, by index or title) |
| `text` | a value, or fixed text | `text` or `source` + `field`, `format`, `tone`, `empty` |
| `counter` | a number with a label: a count for lists and collections, the number itself otherwise | `source`, `field`, `label`, `format`, `tone` |
| `badge` | a short label; `tones` picks the tone by the text shown | `text` or `source` + `field`, `tone`, `tones` |
| `json` | a value tree, opened one level at a time | `source`, `field`, `empty` |
| `code` | monospace text with line numbers and a copy button | `text` or `source` + `field`, `language` (`text`, `json`), `empty` |
| `button` | runs a command, or goes to a route | `label`, `icon`, `tone`, `command`, `args`, `confirm`, `refresh` (sources to read again after), `navigate: { route, params }` |
| `filter` | writes what the user types or picks into the state | `kind` (`search`, `select`, `toggle`), `state`, `label`, `placeholder`, `options` (a list, or `{ source, itemValue, itemLabel }`) |
| `table` | rows and columns, sorted by a header, one selected row | `key`, `columns: [{ field, title, format, width, align }]`, `select`, `open`, `filters`, `sort: { field, dir }`, `height`, `empty` |
| `tree` | nested rows opened a level at a time; a filter flattens them to what matches | `key`, `itemTitle`, `itemChildren`, `itemBadge`, `select`, `open`, `filters`, `height`, `empty` |
| `detail` | the sections of one record, each shown by what its value is | `sections`, `actions` (buttons), `empty` |
| `log` | lines in time, newest first | `itemTime`, `itemTitle`, `itemLevel`, `levelTones`, `open`, `filters`, `newestFirst`, `height`, `empty` |
| `timeline` | rows in time, in lanes; a bar when the row has a duration, a dot otherwise | `itemTime`, `itemDuration`, `itemTitle`, `itemStatus`, `statusTones`, `itemLane`, `lanes`, `key`, `select`, `open`, `filters`, `window` (ms), `live`, `empty` |
| `chart` | a small chart over the rows of a source | `kind` (`line`, `bar`, `spark`), `itemX`, `series`, `tone`, `format`, `window` (last N rows or `{ seconds }`), `height`, `label` |

**`detail` sections**: a string names a field of the record; its view follows the value (an object → its fields,
a list of objects → a table, text with line breaks → code, anything else → the value). The long form
`{ field, title, view, columns, format }` chooses the view (`fields`, `table`, `code`, `json`, `value`). A section
whose value is missing or empty is left out.

**Filters**: `filters: [{ field, state }]` narrow the rows in the panel: text written by a `search` filter is
searched in the field, other values are compared. For large data, pass the filter to the source instead:
`params: { query: { state: 'query' } }`.

**Formats**: `number`, `ms`, `bytes`, `date`, `time`, `relative`, `json`, `component` (a component path).

**Tones**: `accent`, `info`, `success`, `warning`, `danger`, `muted`. Nothing else about the look comes from the
package: no CSS, no HTML, no images. The panel's light and dark themes apply.

## Routes

A route is a view inside the panel, with its own layout, opened over the panel's layout. The title bar then shows
the way back (`Actions › cart/add`) and a back button.

```ts
routes: [{
  id: 'action',
  title: { field: 'name' },          // a fixed string, or a field of `source` read with `params`
  source: 'selectedAction',
  params: { id: { param: 'id' } },
  layout: { type: 'detail', source: 'selectedAction', params: { id: { param: 'id' } }, sections: ['summary', 'changes'] },
}]
```

A route opens from a button (`navigate: { route: 'action', params: { id: { state: 'actionId' } } }`), from a row
of a `table`, `tree`, `log` or `timeline` on a double click (`open: { route: 'action', params: { id: { field: 'id' } } }`),
or from the page with `reveal`. Its widgets read the parameters with `{ param: 'id' }`. The route closes with the
back button, with a reveal that names no route, or when the package stops giving it.

## Pointing the user at something

```ts
devtools.reveal({ panel: 'actions', route: 'action', params: { id: 42 } });   // open a route
devtools.reveal({ panel: 'actions', state: { actionId: 42 } });              // select something in the panel's view
```

`reveal` writes `state` into the panel's state and opens `route` with `params`, or closes the open route when none is
named. When the panel is open, that happens at once. When the panel app is shown and the user is not typing in it,
the panel app switches to that panel. Otherwise nothing moves: the panel gets a mark in the sidebar, and the target
is applied when the user opens it. A reveal for a panel the devtools has not listed yet waits for the list.

## Events and the Performance timeline

`devtools.emit(type, payload)` sends an event of the package. A source whose `events` names the type changes its
rows as described above; `describe()` is read again on every event of the package.

A panel's `lanes` put the package's events on the Performance timeline, under the built-in lanes, cleared with the
recording:

```ts
lanes: [{ id: 'actions', label: 'Actions', tone: 'accent', event: 'action:end', itemDuration: 'duration', itemTitle: 'name' }]
```

The item's time is the event's; `itemDuration` (ms) makes it a bar that ends at that time, `itemTitle` names it.

## Limits

The bridge in the page applies these; `mount({ limits })` and `createBridge({ limits })` change them for the
in-page panel (the extension uses the defaults).

| Where | Limit | Past it |
| --- | --- | --- |
| events | 1000 per package per second (`eventRate`) | the rest are dropped; the panel says "N events dropped" |
| an event | 64 KB after copying, depth 6 (`eventSize`, `eventDepth`) | replaced by its size |
| panel metadata | 256 KB, 2000 objects, depth 32 per package (`panelsSize`, `panelsNodes`, `panelsDepth`) | refused whole; the sidebar shows the panel with its problem |
| a source answer | 1 MB (`sourceSize`) | a list is cut with a marker the widgets count ("N more rows"); a single value goes shallower |
| a read or a command | 10 s (`callTimeout`); 4 in flight per package (`concurrentCalls`) | `timeout`, `busy` |
| count | 32 packages (`maxExtensions`), 8 panels per package (`maxPanels`) | the rest are counted in the sidebar; the package is refused as `too-many-panels` |
| rows in the panel | `max` of the source (5000 unless given, 50 000 at most) | the oldest rows go |

The panel reads from the page only while it is shown and the panel is open, at most every 250 ms; a user action
reads at once. Tables, trees, logs and timelines are virtual: only what is visible is drawn.

## In the browser stores

Chrome, Edge and Firefox forbid an extension to load and run code from outside its package. Panel metadata is data,
not code: the widgets that draw it ship with the extension, and nothing a package sends is executed, written as
HTML or loaded from an address. The extension asks for no new permission and makes no network request for this.

## A whole example

`examples/basic/src/actions.ts` in this repository is an action history: every button of the example app runs
through `runAction`, which is an operation of the core, so the stores it wrote, the actions nested in it, its
duration and its failure are recorded. The panel shows the actions on a timeline with a detail beside it, a route
for one action with its store changes, a lane on the Performance timeline, and a reveal when an action fails.
`examples/basic/src/devtools-orders.ts` is a smaller one over a store: a table with a detail, filters, a chart, a
log, and commands that change the app.
