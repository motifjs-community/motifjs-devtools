# Changelog

All notable changes to this package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-11-04

### Added

- Panels of packages. A package registered with `registerDevtools` that gives `panels` (a core with `readExtensionPanels`) gets its own sections in the sidebar, placed by `order` among the built-in ones, with a mark when its commands may change the app. The panel draws the layout from the metadata: `stack`, `toolbar`, `split` (a dragged divider), `tabs`, `text`, `counter`, `badge`, `json` (a value tree), `code` (numbered lines, copy), `button`, `filter` (search, choice or switch written into the panel's state), `table` and `tree` (virtual rows, sorting, the filters of the state, one selected row), `detail` (the sections of a record shown by what their values are, with actions) and `chart` (line, bars or a sparkline over a source), and a placeholder for a widget it does not know. `sources` are read with parameters that follow the panel's state and read again on `extension:changed`, on the package's own events named in a source's `events`, and after a command that names them in `refresh`; `commands` run through `callExtension` from a panel with `write`. A package without panels, or on an older core, shows `describe()` as a value tree in a panel of its own, read again on every event of the package and on every reactivity flush while the panel is open. The metadata types (`PanelMetadata`, `Widget` and the widgets) are exported for package authors.
- Package events change the rows the panel holds: a source's `events` map a type to `upsert`, `append`, `remove` or `refresh`, `max` bounds the rows kept (5000 unless given, 50 000 at most), and the `log` and `timeline` widgets show rows in time (lines newest first; bars or dots in lanes, a window of 10 s to 5 min that follows the present). A panel's `lanes` add lanes to the Performance timeline, fed by the package's events. The Extensions tab of a selected component shows what each package says about it as a value tree. A panel says how many events the bridge dropped.
- Routes: views inside a panel (`routes` in the metadata), opened by a button's `navigate`, by a double click on a row of a `table`, `tree`, `log` or `timeline` (`open`, with `{ field }` reading the row), or by the package's `reveal()`. The title bar shows the way back and a back button; the route's widgets read its parameters with `{ param }`, and its title can come from a field of a source. `reveal({ panel, route?, params?, state? })` writes the panel's state and opens the route at once when the panel is open, moves to the panel when the panel app is shown and nobody is typing in it, and otherwise marks the panel in the sidebar and applies the target when the user opens it.
- Protocol: `readExtensionPanels` and `readExtensionSource` (read), `callExtension` (write), the `ContractResult` and `ExtensionPanels` types. `SLOW_METHODS` names the methods that run a package's code; `createClient(port, timeout, slowTimeout)` waits longer for them.
- Limits on the page side, in `src/bridge/limits.ts`: a source answer of 1 MB (a list is cut with a `truncated` marker, a single value goes shallower), panel metadata of 256 KB, 2000 widgets and 32 levels (refused whole as `panels-too-large`), 8 panels per package and 32 packages (the rest counted in the sidebar), a package event of 64 KB at depth 6 (a bigger one is replaced by its size), 1000 events per package per second (the rest dropped and told as `devtools:ext-dropped`), 10 s per call and 4 calls in flight per package (`timeout`, `busy`). `createBridge({ limits })` and `mount({ limits })` change them (`Limits`, `DEFAULT_LIMITS`).
- `docs/extensions.md`, shipped in the npm package: how a package gives a panel, the metadata and every widget, routes, reveal, events, lanes and the limits. The same text is the `motifjs-devtools` skill in motifjs-community/skills.
- The example app has an action history (`examples/basic/src/actions.ts`): every button runs as an operation of the core, the panel shows the actions in time with the stores they wrote, the actions nested in them, a route per action, a lane on the Performance timeline, and a reveal when an action fails.

- Highlight updates: a header button that outlines in the page every element a reactivity flush changed, with a
  count and a warmer color for elements updated again less than a second after their last update. It is off by
  default and remembered by the panel. The `flashUpdates` page method turns it on and off.

### Fixed

- The 128 px toolbar icon of the idle state was a damaged PNG, so Chrome refused to install the extension from the
  store ("Could not decode image: 'idle-128.png'").

## [0.4.0] - 2026-10-29

### Added

- Elements shows every root of the app: the `run()` shell, the page layer (`app.layer`) and each window opened or attached through `app.windows`, with the window's title. A window row counts the components the app moved into that window by hand (`N hosted`) and walks their trees under it. The documents of the app are listed under the tree head, and a row whose element lives in another document carries that document's name: its title, else its frame's title, name or id (a window's name), else `iframe` or `window`. The row of an `<iframe>` element always shows the frame's title, name or id; when its document is connected the row also counts the components moved into it and walks their trees under it, as a window row does. The document badge sits on the first row of a subtree that lives elsewhere, not on every row under it.
- Select in the page works in every document of the app: the highlight is drawn in the element's own document and picking works inside popups, Picture-in-Picture windows and connected iframes.
- `client.stream()` for answers that arrive in slices, the `readTree` page method and the `chunk` and `cancel` messages behind it.
- `client.shown` and `client.onShown()`: the in-page panel learns when it is closed and opened again (`visibility` message), and the extension panel when its DevTools tab is hidden and shown.
- The `scheduler` option of `createBridge`.

### Changed

- The panel follows devtools contract version 2 (paths start with the root's index, `getDocuments()`, `documents:changed`) and still works with a contract 1 core, which it reads as a single-root tree.
- A root cannot be hidden from Elements; the visibility button is left out for roots.
- The panel is built with MotifJS 1.2.0-rc.23.
- The bridge queues the app's events while the page works and sends them after the next frame, in messages of up to 500 events. An open panel no longer delays building or leaving a page.
- Events are sent as `{ kind: 'events', events }` (`BridgeEvents`) instead of one `{ kind: 'event', event }` message (`BridgeEvent`) per event.
- Elements reads the tree in slices of 500 components, computes its rows in slices and shows them in a virtual list. Opening it on a page with tens of thousands of components no longer blocks the page or the panel.
- The panel reads from the page only while it is shown and while the screen that shows the data is open, at most every 250 ms or four times as long as the previous read took.

### Fixed

- Switching to Stores, Reactivity, Services or Routes stalled on an app with many stores: every row scanned the reactive store list on each read. Rows are looked up by id.
- Opening Stores while a store was leaving the list threw `MJX208`.

## [0.3.0] - 2026-10-23

### Changed

- The panel, the in-page button, the element overlay, the extension popup and the toolbar icons use the MotifJS mark and its orange accent.
- The panel is built with MotifJS 1.2.0-rc.18.
- The Rollup setup in the README passes `production` to the compiler, which leaves the development-only DevTools hooks of MotifJS out of production bundles.

## [0.2.0] - 2026-10-14

### Added

- Chrome, Edge and Firefox extension with a MotifJS tab in DevTools, a toolbar icon and popup that show whether the page runs MotifJS in development mode, and the bridge added to the page only while the tab is open.

### Fixed

- Elements no longer shows an error from an older tree request after a newer one succeeded.
- Stores shows `1 key` and `1 item` instead of `1 keys` and `1 items`.

## [0.1.0] - 2026-10-14

### Added

- Page bridge for devtools contract version 1, with JSON transfer of every value.
- `mount()`: in-page panel that comes with the package and loads when it first opens, docked to the bottom or the right, or in a separate window.
- Panel shell with light and dark themes, connection status and header counters.
- Home: versions of DevTools, MotifJS and the contract, a summary of the app that opens each screen, and community links.
- Elements: component tree, inspector, prop values opened one level at a time, class and visibility writes.
- Select a component in the page and highlight components from the tree.
- Reactivity: run and flush counters, flush timeline with triggers and effects, links from effects to Elements.
- Performance: JS heap and component counts over time, a warning when components outside the tree keep rising, a timeline of navigations, flushes, builds and disposals with range selection, and the slowest components, flushes and navigations.
- Router: current route with params and chain, recent navigations with outcome, duration and details, outcome filter, and a Routes tab with the route configuration as a tree.
- Logs: warnings and errors with count, first and last seen, details, error cause and stack, level filter.
- Stores: stores named after the field that keeps them or, for a module store, after its variable and file, holders, last change, values opened one level at a time and edited in place, type filter, live updates and released stores set aside.
- Elements: the component's own fields in the inspector.
- Reactivity: triggers name the store and field that changed.
- Services: registered services with lifetime and state, the scope tree with the current scope selected, services of a scope opened one level at a time, and live activity of created and disposed instances.
