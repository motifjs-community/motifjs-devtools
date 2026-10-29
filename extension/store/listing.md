# Store listing

Texts for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). Packages come from
`npm run extension:zip` in `dist-store/`; screenshots are in `screenshots/` next to this file.

## Shared

- **Name:** MotifJS DevTools
- **Category:** Developer Tools (Chrome, Edge), Web Development (Firefox)
- **Language:** English
- **Homepage:** https://github.com/motifjs-community/motifjs-devtools
- **Support:** https://github.com/motifjs-community/motifjs-devtools/issues
- **Privacy policy:** https://github.com/motifjs-community/motifjs-devtools/blob/main/PRIVACY.md
- **License:** MIT

### Summary

Inspect MotifJS apps in DevTools: components, reactivity, performance, router, stores, services and logs.

### Description

MotifJS DevTools adds a MotifJS tab to the browser's developer tools for apps built with MotifJS, the fine-grained
reactive UI framework without a virtual DOM.

Call app.useDevelopment(true) in your app while developing; nothing else is needed. The tab appears on pages that
run a MotifJS app in development mode, and the toolbar icon turns purple on them.

What you can inspect:

• Home: the MotifJS and contract versions and a summary of the app.
• Elements: the live component tree with search, props, fields, bindings, classes, attributes, events, services and
  effects. Every root of the app is listed: the page, the page layer and each window the app opens. A component
  that lives in a popup, a Picture-in-Picture window or an iframe carries that document's name. Select a component
  in any of these documents or highlight it from the tree. Large trees are read in slices and shown in a virtual
  list, so the page stays responsive while you look.
• Reactivity: every flush with the changes that started it and the effects that ran.
• Performance: JS heap and components outside the tree over time, a timeline of navigations, flushes, builds and
  disposals, and the slowest components, flushes and navigations.
• Router: the current route with its params, recent navigations with their outcome and duration, and the route
  configuration as a tree.
• Stores: every reactive store, signal and computed, named after the field or module that keeps it, editable in
  place.
• Services: registered services, the scope tree with the services created in each scope, and live activity.
• Logs: warnings and errors with their details, cause and stack.

The extension works only inside your browser. It does not collect or send any data.

Source code and the in-page version for any bundler: https://github.com/motifjs-community/motifjs-devtools

## Chrome Web Store: privacy practices

- **Single purpose:** Adds a MotifJS tab to DevTools for inspecting web apps built with MotifJS while they run in
  development mode.
- **Host permission justification (`<all_urls>` and the content scripts):** A MotifJS app can run on any address:
  localhost, a staging server, a file. A small content script on each page waits for the `__MOTIF_DEVTOOLS__` object
  that MotifJS creates in development mode, to show the MotifJS tab and color the toolbar icon. It reads nothing else
  on the page and sends nothing anywhere.
- **`scripting` justification:** When the MotifJS tab opens, the extension adds a bridge script to the inspected page
  that reads the app through `__MOTIF_DEVTOOLS__` and passes the data to the panel. The bridge is removed when the tab
  closes. The toolbar popup also uses it to read the MotifJS version of the current page.
- **Remote code:** No. All code is in the package.
- **Data usage:** The extension collects no user data. Check none of the data types, and certify the three
  statements (no selling, no use unrelated to the single purpose, no creditworthiness use).

## Microsoft Edge Add-ons

- Use the Chrome package (`motifjs-devtools-chrome-<version>.zip`) as it is.
- **Search terms:** motifjs, devtools, reactive, components, debugging, performance, developer tools
- Privacy policy, description and screenshots as above.

## Firefox Add-ons (AMO)

- **Package:** `motifjs-devtools-firefox-<version>.zip`.
- **Summary (up to 250 characters):** the summary above.
- **Source code:** the code in the package is bundled and minified, so upload `motifjs-devtools-source-<version>.zip`
  when AMO asks for it.
- **Notes to reviewer:**

  > The package is built from the attached source archive (also at
  > https://github.com/motifjs-community/motifjs-devtools). To build it: Node.js 22 or later and npm, then
  > `npm ci` and `npm run extension:build` in the root of the archive. The result is `dist-extension-firefox/`, the
  > same files as the package. The build was made on Windows 11 with Node.js 24.
  >
  > The panel is a MotifJS app. The single innerHTML warning in `assets/panel.js` comes from MotifJS's `x-html`
  > binding, which the panel uses only for its own fixed SVG icons; no page content is ever written with it.
  >
  > To try it: open any MotifJS app that calls `app.useDevelopment(true)`, for example
  > https://motifjs-community.github.io/motifjs-devtools/, open DevTools and choose the MotifJS tab.
