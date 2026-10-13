# motifjs-devtools

`motifjs-devtools` is a developer tools panel for **MotifJS** (`@motifx/core`), the fine-grained reactive UI framework without a virtual DOM.

> **Status:** in development and not on npm yet. It needs devtools contract version 1, which ships in the
> `@motifx/core` release after `1.2.0-rc.5`. Until then it runs against a local core build through the
> example in this repository.

## What it shows

- **Elements.** The live component tree. Every element is a component; class and function components show
  by name, plain elements can be hidden with one button. Search by name or tag, `WAITING` / `HIDDEN`
  badges, and whether each component is in the document. The inspector lists props (opened one level at a
  time, getters are never called), bindings, classes (add and remove), attributes, events, hooks, services,
  effects and data from community packages, and can show or hide the component.
- **Select in the page.** Point at something in the app to highlight its component, click to select it in
  the tree. Hovering a tree row highlights the component in the page.
- **Reactivity.** Total effect runs, flushes, the last and the slowest flush, live effects, and a timeline of
  the last 200 flushes. A flush opens to the changes that started it and the effects that ran; an effect
  links to its component in Elements. Recording starts when the panel opens and can be paused or cleared.
- **Header counters.** Components in the tree, live effects and the duration of the last reactivity flush.
- **Router, Stores, Logs.** The sections are in the menu; their screens are not built yet.

Light and dark themes follow the system, or are chosen in the header.

## How it connects

`app.useDevelopment(true)` turns devtools on in the app: the core puts the devtools contract on
`globalThis.__MOTIF_DEVTOOLS__`. A small bridge in the page reads that object and talks to the panel with
`postMessage`, carrying JSON data only. The panel is a separate MotifJS app in its own iframe or window. It
never touches the app's objects and never appears in the app's component tree.

## In-page panel

```ts
const app = Application.CreateBuilder().build();
app.useDevelopment(true);
app.run('#app', <App />);

// Vite
if (import.meta.env.DEV) import('@motifx-community/devtools').then((m) => m.mount({ src: '/panel.html' }));

// webpack
if (process.env.NODE_ENV !== 'production') import('@motifx-community/devtools').then((m) => m.mount({ src: '/panel.html' }));
```

`mount()` adds a button to the bottom right corner of the page. The panel opens docked to the bottom or the
right of the page, or in a separate window; buttons in its header switch between the three. The position
and size are remembered in `localStorage` under `motif-devtools:dock`. Closing the separate window brings the
panel back to where it was docked.

`src` is the URL of the panel page. The example serves it as `panel.html`; the panel page is not bundled
into the package yet.

## API

| Export | Description |
| --- | --- |
| `mount(options?)` | Adds the button and the panel to the page and returns a `DevtoolsHandle`. A second call returns the same handle. |
| `MountOptions` | `src` (panel page URL), `html` (panel page as a string), `open` (open at once), `position` (`'bottom'`, `'right'` or `'window'`) |
| `DevtoolsHandle` | `isOpen`, `position`, `open()`, `close()`, `toggle()`, `dock(position)`, `dispose()` |
| `createBridge({ send })` | The page side: follows `__MOTIF_DEVTOOLS__`, answers requests, forwards events. `receive(message)` takes messages from the panel. |
| `createClient(port)` | The panel side: `request(method, ...args)`, `onEvent`, `onStatus`, `onDock`, `setDock`. |
| `toTransfer(value, depth?)` | Turns any value into JSON data; values JSON cannot carry are marked with `$motif`. |

## Examples

`examples/basic` is a small Vite app with the in-page panel. Run it with `npm run dev`.

## Contributing

`npm install`, then `npm run check` runs typecheck, `motif-lint`, tests and both builds. See
[CONTRIBUTING.md](https://github.com/motifjs-community/.github/blob/main/CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
