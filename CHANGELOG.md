# Changelog

All notable changes to this package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
