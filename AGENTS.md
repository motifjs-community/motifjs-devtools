# motifjs-devtools — agent notes

## What this is

The developer tools panel for MotifJS (`@motifx/core`), published to npm as `@motifx-community/devtools`.
It reads the devtools contract the core puts on `globalThis.__MOTIF_DEVTOOLS__` after
`app.useDevelopment(true)` (type `MotifDevtools` from `@motifx/core/devtools`, contract version 1).

## Layout

- `src/bridge/`: runs in the inspected page. `bridge.ts` follows `__MOTIF_DEVTOOLS__`, answers requests from
  an allow list and forwards contract events; `serialize.ts` turns every value into JSON data; `picker.ts` and
  `overlay.ts` do the select-in-page and highlight; `protocol.ts` holds the message types and method lists.
- `src/client/`: runs in the panel. `createClient(port)` sends requests and receives responses, events, the
  connection status and the dock position.
- `src/transport/window.ts`: a `Port` over `postMessage` between two windows.
- `src/inpage/`: `mount()`, the button and the docked iframe / separate window in the inspected page.
- `src/panel/`: the panel app, written in MotifJS. `model/` holds the state (`DevtoolsModel`,
  `ElementsModel`), `pages/` the screens, `styles/` the CSS with light and dark tokens.
- `examples/basic/`: a demo app (`index.html`) and the panel page (`panel.html`).

## Build / test / lint commands

- `npm test`: Vitest + jsdom, files in `tests/`. JSX works in tests because Vitest uses `vite.config.ts`.
- `npm run typecheck`: `tsc --noEmit` over `src`, `tests` and `examples`.
- `npm run lint:jsx`: `motif-lint`.
- `npm run build`: library build of `src/index.ts` to `dist/index.js`, then `.d.ts` files (the panel is left out).
- `npm run dev` / `npm run example:build`: the demo in `examples/basic` with the panel page.
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

## Where to look

- `src/index.ts`: the public API, named exports only
- `src/bridge/protocol.ts`: every message and method name
- `tests/elements.test.tsx`: how a screen is tested with a fake client
- `tests/bridge.test.tsx`, `tests/picker.test.tsx`: the page side against a real app
