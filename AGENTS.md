# motifjs-devtools — agent notes

## What this is

The developer tools panel for MotifJS (`@motifx/core`), published to npm as `@motifx-community/devtools`.
It reads the devtools contract the core puts on `globalThis.__MOTIF_DEVTOOLS__` after
`app.useDevelopment(true)` (type `MotifDevtools` from `@motifx/core/devtools`, contract version 1).

## Layout

- `src/bridge/`: runs in the inspected page. `bridge.ts` follows `__MOTIF_DEVTOOLS__`, answers requests from
  an allow list and forwards contract events; `outbox.ts` queues events and status, and sends them after the next
  frame in slices of 500 (`DEFERRED` events are copied when sent, all others when they happen); `copy.ts` is the
  fast copy for those frequent events and must give the same result as `toTransfer`; `tree.ts` streams the
  component tree for `readTree` in slices; `schedule.ts` holds the frame, task (`MessageChannel`) and timer
  functions; `serialize.ts` turns every value into JSON data; `picker.ts` and `overlay.ts` do the select-in-page
  and highlight; `protocol.ts` holds the message types and method lists.
- `src/client/`: runs in the panel. `createClient(port)` sends requests and streams, and receives responses,
  chunks, event batches, the connection status, the dock position and whether the host shows the panel.
- `src/transport/window.ts`: a `Port` over `postMessage` between two windows.
- `src/inpage/`: `mount()`, the button and the docked iframe / separate window in the inspected page. Without
  `src` or `html` it loads the panel from `virtual:motif-devtools-panel`.
- `src/panel/`: the panel app, written in MotifJS. `model/` holds the state (`DevtoolsModel`,
  `ElementsModel`), `pages/` the screens, `styles/` the CSS with light and dark tokens. Every automatic read from
  the page goes through `model/reader.ts`: only while the panel is shown and its screen is open, one read at a
  time, at most every 250 ms or four times the last read; a user action reads at once.
- `scripts/panel.ts`: the Vite plugin behind `virtual:motif-devtools-panel`. In a build it compiles `src/panel` with
  its own copy of `@motifx/core` into one HTML page and exports it as a string; on the dev server it exports a page
  that loads `src/panel/main.tsx` from the server.
- `extension/`: the browser extension (Manifest V3) for Chrome, Edge and Firefox. `src/detect.ts` waits for `__MOTIF_DEVTOOLS__` on every
  page, `src/relay.ts` is the content script between the page and the extension, `src/pageBridge.ts` runs the bridge
  in the page while the MotifJS tab is open, `src/router.ts` is the service worker that pairs each DevTools tab with
  its page, `src/panelPort.ts` is the panel's `Port`. `entries/` holds the scripts and pages the build starts from;
  `src/api.ts` picks `browser` (Firefox) or `chrome`. `scripts/build-extension.mjs` writes `dist-extension/` for Chrome and
  Edge and `dist-extension-firefox/` for Firefox; only their manifests differ.
- `examples/basic/`: a small shop that exercises every screen; each page says what to look at in the panel.

## Build / test / lint commands

- `npm test`: Vitest + jsdom, files in `tests/`. JSX works in tests because Vitest uses `vite.config.ts`.
- `npm run typecheck`: `tsc --noEmit` over `src`, `tests`, `examples` and `scripts`.
- `npm run lint:jsx`: `motif-lint`.
- `npm run build`: library build of `src/index.ts` to `dist/index.js` and the panel to `dist/panel-[hash].js`, then
  `.d.ts` files.
- `npm run dev` / `npm run example:build`: the demo in `examples/basic` with the in-page panel.
- `npm run extension:build`: the extension to `dist-extension/` (Chrome, Edge) and `dist-extension-firefox/` (Firefox),
  ready to load from disk.
- `npm run extension:zip`: the store packages and the source archive in `dist-store/`; the store texts and
  screenshots are in `extension/store/`.
- `npm run check`: all of the above, in CI order. Read the build output too: compiler warnings such as
  `MJX001` show there.

## Rules for this repository

- `src/bridge`, `src/client`, `src/transport` and `src/inpage` never import `@motifx/core`. They run next to
  the user's app; a second core in the page would split reactivity and show up in the app's tree.
- The panel talks to the page only through the client. Everything crossing `postMessage` is plain JSON:
  copy reactive data before sending it (`[...row.path]`), a Proxy cannot be cloned.
- Never call getters or functions of the inspected app while reading it. The contract and `toTransfer`
  already avoid it; keep it that way in new code.
- Writes go through the contract's write methods only.
- New contract methods are a core change, decided in the core repository (`motifjsdev/motifjs`); this
  repository adapts to them.

## MotifJS ground rules (short)

- `view()` runs once; reactive reads must be fields (`{state.n}`) or getters (`{() => a + b}`).
- `class`/`onclick`, not `className`/`onClick`.
- Lists need object items and a stable `key`; rows match by object identity.
- `x-wait` keeps state; `{cond && <X/>}` rebuilds the component on every show.
- `ref` gives the component; the element is `ref.element`.
- External resources (timers, observers, third-party instances) go to `this.motif.setDisposable`.
- Reactive updates flush on a microtask: `await Promise.resolve()` in tests before asserting.

Full rules: <https://motifjs.com/llms.txt>

## Pitfalls met here

- A ternary written as a component prop is always wrapped in a getter: `<Value value={a ? x : y} />` hands
  `Value` a function. Compute the value before the JSX.
- A block-bodied getter in JSX child position with a ternary in its `return` loses its local variables
  (`MJX001`). Move the logic into a named helper and write `{() => helper()}`.
- A child getter that returns an object is placed as a component and fails. Return text from text getters.
- `event.composedPath()` is empty once the event has finished; read the target while handling it.
- `noImplicitOverride` is on: lifecycle methods and `view()` need `override`.
- Bridge events arrive after the next frame. In tests create the bridge with `scheduler: microScheduler` from
  `tests/helpers.ts` and `await drain()` before reading the sent messages.
- The Elements tree is a `Virtualization` list. jsdom has no layout, so tests give elements a `clientHeight`
  (see `tests/elements.test.tsx`), and the rows reach the DOM one microtask after the model changes.

## Where to look

- `src/index.ts`: the public API, named exports only
- `src/bridge/protocol.ts`: every message and method name
- `tests/elements.test.tsx`: how a screen is tested with a fake client
- `tests/bridge.test.tsx`, `tests/picker.test.tsx`: the page side against a real app
