# motifjs-devtools

`motifjs-devtools` is a developer tools panel for **MotifJS** (`@motifx/core`), the fine-grained reactive UI framework without a virtual DOM.

> **Status:** early release. It needs `@motifx/core` 1.2.0-rc.6 or later, which has devtools contract version 1.
> Try it in the browser: [live example](https://motifjs-community.github.io/motifjs-devtools/).

![The panel docked under a MotifJS app, inspecting a row of the orders table](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/hero.png)

## What it shows

- **Home.** The panel opens here: the DevTools, MotifJS and contract versions, where the panel is connected,
  how many components, stores, services, routes and issues the app has (each opens its screen), and links to
  the source code, the documentation, the release notes and npm, and to report a bug or share an idea.
- **Elements.** The live component tree. Every element is a component; class and function components show
  by name, plain elements can be hidden with one button. Search by name or tag, `WAITING` / `HIDDEN`
  badges, and whether each component is in the document. The inspector lists props and the component's own
  fields such as `state` (opened one level at a time, getters are never called), bindings, classes (add and remove), attributes, events, hooks, services,
  effects and data from community packages, and can show or hide the component.
- **Select in the page.** Point at something in the app to highlight its component, click to select it in
  the tree. Hovering a tree row highlights the component in the page.
- **Reactivity.** Total effect runs, flushes, the last and the slowest flush, live effects, and a timeline of
  the last 200 flushes. A flush opens to the changes that started it and the effects that ran; an effect
  links to its component in Elements. Recording starts when the panel opens and can be paused or cleared.
- **Performance.** The JS heap of the page, live components, components not in the tree and stores waiting for
  garbage collection. Charts show the heap and the components outside the tree for up to the last 5 minutes,
  sampled every 2 seconds, with navigations marked; a warning shows when the components outside the tree rose after
  each of the last 3 navigations. Chrome and Edge report the heap and round it unless started with
  `--enable-precise-memory-info`; other browsers show the counts only. The timeline puts navigations, reactivity
  flushes, builds and disposals on lanes over the last 10 s, 30 s, 1 min or 5 min; the components built or disposed
  together are one bar with their count and duration. Dragging across the lanes selects a range, and the event list
  and the tables of the slowest components (by type, including the components inside), the longest flushes and the
  longest navigations follow it. Recording starts when the panel opens and can be paused or cleared.
- **Router.** The current route with its params and the paths along its chain, and the last 50 navigations
  the app recorded since devtools was enabled: the address shown, the address requested when a redirect or
  middleware changed it, the outcome (`done`, `skipped`, `cancelled`, `notFound`, `error`), the duration, the
  time and the cancel reason. The list can be filtered by outcome. The Routes tab shows the route configuration
  given to `app.useRouter()` as a tree: each route with its full path, name, component, redirect, aliases,
  `keepAlive`, hooks (`validate`, `onEntering`, `onEnter`, `onLeave`, `onUpdate`, `onShow`) and `meta`; the
  chain of the current route is marked.
- **Header counters.** Components in the tree, live effects and the duration of the last reactivity flush.
- **Logs.** Warnings and errors the app reported since devtools was enabled, most recently seen first. The same
  warning or error is shown once with how many times it came and when it was first and last seen; a warning
  opens to its details, an error to its name, cause and stack. The list can be filtered by level, and the menu
  shows how many there are.
- **Stores.** Every `reactive`, `useModel`, signal and computed the app keeps, named after the component or
  service field that holds it (`Settings.prefs`, `ThemeService.theme`) or, for a module store, after its variable
  and file (`cart`, `src/stores/cart.ts`), with its type and a short value. A store
  opens to who keeps it (a component links to Elements), the last field that changed and its value one level at
  a time; a string, number or boolean value can be edited in place. The list can be filtered by type and follows the app as stores are created and components go away;
  a store no longer kept by a component or service is set aside under "Show released" until the browser collects
  it. Flush triggers in Reactivity name the store and field that changed.
- **Services.** Every service the app registered with its lifetime and state: active, active in how many
  scopes, or not requested yet. The scope tree shows the root, one scope per navigation and scopes opened with
  `createScope`; the current navigation's scope is selected first, and a previous one kept by a `keepAlive` page
  says how many pages keep it. A scope lists the services created in it and the registered ones it has not
  created; a created service opens to its fields one level at a time. Created and disposed instances are listed
  live under Activity.

Light and dark themes follow the system, or are chosen in the header.

## Screenshots

| | |
| --- | --- |
| ![Home](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/home.png) **Home** | ![Elements](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/elements.png) **Elements** |
| ![Reactivity](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/reactivity.png) **Reactivity** | ![Performance](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/performance.png) **Performance** |
| ![Router](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/router.png) **Router** | ![Routes](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/routes.png) **Router · Routes** |
| ![Stores](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/stores.png) **Stores** | ![Services](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/services.png) **Services** |
| ![Logs](https://raw.githubusercontent.com/motifjs-community/motifjs-devtools/main/.github/assets/screenshots/logs.png) **Logs** | |

## How it connects

`app.useDevelopment(true)` turns devtools on in the app: the core puts the devtools contract on
`globalThis.__MOTIF_DEVTOOLS__`. A small bridge in the page reads that object and talks to the panel with
`postMessage`, carrying JSON data only. The panel is a separate MotifJS app in its own iframe or window. It
never touches the app's objects and never appears in the app's component tree.

There are two ways to open the panel: as a **MotifJS** tab in the browser's DevTools with the extension, or
docked in the page with the npm package. Both show the same panel.

## Browser extension

The extension adds a **MotifJS** tab to Chrome and Edge DevTools. The app only needs
`app.useDevelopment(true)`; nothing is installed in the app.

- The tab appears when the inspected page runs a MotifJS app in development mode. The toolbar icon is colored on
  such a page, and its popup says which MotifJS version runs there.
- A small detector on every page waits for the devtools contract without polling. The bridge is added to the page
  only while the MotifJS tab is open and removed when DevTools closes. Reloading the page reconnects the tab.
- The extension reads pages to find MotifJS apps, so the browser asks for access to all sites when it is
  installed. Nothing leaves the browser.

Until it is in the Chrome Web Store, build it from this repository and load it unpacked:

```sh
npm install
npm run extension:build
```

Then open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, choose **Load unpacked** and
select the `dist-extension` folder. Chrome 111 or later, or Edge 111 or later, is needed.

## In-page panel

```sh
npm install --save-dev @motifx-community/devtools
```

Turn devtools on in the app with `app.useDevelopment(true)` and call `mount()` while developing. The panel comes
with the package: there is no page to serve and nothing else to configure. The package is loaded with a dynamic
`import()` inside a development check, so a production build leaves it out entirely.

### Vite

```ts
const app = Application.CreateBuilder().build();
app.useDevelopment(import.meta.env.DEV);
app.run('#app', <App />);

if (import.meta.env.DEV) import('@motifx-community/devtools').then((m) => m.mount());
```

### Rollup

```ts
if (process.env.NODE_ENV !== 'production') import('@motifx-community/devtools').then((m) => m.mount());
```

Rollup does not define `process.env.NODE_ENV`; set it with `@rollup/plugin-replace`. The panel is a separate chunk,
so the build writes to `output.dir`:

```js
// rollup.config.js
import compiler from '@motifx/compiler';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/main.tsx',
  output: { dir: 'dist', format: 'es' },
  plugins: [
    compiler({ storeNames: !production }),
    nodeResolve({ extensions: ['.tsx', '.ts', '.jsx', '.js'] }),
    replace({ preventAssignment: true, values: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') } }),
  ],
};
```

### webpack

```ts
if (process.env.NODE_ENV !== 'production') import('@motifx-community/devtools').then((m) => m.mount());
```

webpack sets `process.env.NODE_ENV` from `mode`, so nothing else is needed.

### Where the panel opens

`mount()` adds a button to the bottom right corner of the page. The panel opens docked to the bottom or the
right of the page, or in a separate window; buttons in its header switch between the three. The position
and size are remembered in `localStorage` under `motif-devtools:dock`. Closing the separate window brings the
panel back to where it was docked.

The panel loads the first time it opens. It runs in its own frame with its own copy of MotifJS, so it never
appears in the app's component tree and does not share state with the app. A page whose Content Security Policy
does not allow inline scripts can serve the panel page itself and pass its address as `src`.

Stores kept in a component or service field are named after the field. Module stores
(`export const cart = reactive({ … })`) are named after their variable and file by `@motifx/compiler`: with Vite
while developing, with Rollup when `storeNames` is on as above.

## API

| Export | Description |
| --- | --- |
| `mount(options?)` | Adds the button and the panel to the page and returns a `DevtoolsHandle`. A second call returns the same handle. |
| `MountOptions` | All optional: `open` (open at once), `position` (`'bottom'`, `'right'` or `'window'`), `src` (address of a panel page you serve yourself), `html` (a panel page as a string). Without `src` or `html` the panel that comes with the package is used. |
| `DevtoolsHandle` | `isOpen`, `position`, `open()`, `close()`, `toggle()`, `dock(position)`, `dispose()` |
| `createBridge({ send })` | The page side: follows `__MOTIF_DEVTOOLS__`, answers requests, forwards events. `receive(message)` takes messages from the panel. |
| `createClient(port)` | The panel side: `request(method, ...args)`, `onEvent`, `onStatus`, `onDock`, `setDock`. |
| `toTransfer(value, depth?)` | Turns any value into JSON data; values JSON cannot carry are marked with `$motif`. |

## Examples

`examples/basic` is a small shop built with MotifJS, with the in-page panel. Run it with `npm run dev`. Each page
ends with what to look at in the panel:

- **Dashboard:** module stores named with their file, a list, flushes with their triggers, and a page kept alive
  (`keepAlive`) that Performance counts outside the tree after you leave.
- **Order:** route params and a scoped `OrderDraft` service, created again on every navigation.
- **Cart:** a singleton `CartService` with a store and two computeds, a transient `PriceFormatter`, a condition and a
  small package that reports to the panel with `registerDevtools`.
- **Settings:** a signal in `ThemeService`, a store kept in a component field to edit from Stores, and an
  `onLeave` hook that cancels the navigation while there are unsaved changes.
- **Lab:** `x-wait`, a ternary, `&&` and `switch`, a list of 1,000 rows, a scope opened with `createScope`, a warning
  and an error.
- **Router cases:** a nested route, an alias, a redirect, a missing page, a page that throws and a redirect loop.

## Contributing

`npm install`, then `npm run check` runs typecheck, `motif-lint`, tests and both builds. See
[CONTRIBUTING.md](https://github.com/motifjs-community/.github/blob/main/CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
