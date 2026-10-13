# motifjs-devtools

`motifjs-devtools` is a developer tools panel for **MotifJS** (`@motifx/core`), the fine-grained reactive UI framework without a virtual DOM.

> **Status:** in development and not on npm yet. It needs devtools contract version 1, which ships in the
> `@motifx/core` release after `1.2.0-rc.5`. Until then it runs against a local core build through the
> example in this repository.

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

Stores created at module level (`export const cart = reactive({ … })`) exist before `useDevelopment(true)`
runs. While developing with `@motifx/compiler`, top-level stores are named by the compiler and listed with
their variable and file. Stores created early in other ways are listed when the development flag is set
before the app code:

```html
<script>globalThis.__MOTIF_DEV__ = true;</script>
```

Stores kept in a component or service field show up without it.

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
