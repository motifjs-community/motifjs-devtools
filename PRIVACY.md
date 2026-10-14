# Privacy policy

MotifJS DevTools (the browser extension and the `@motifx-community/devtools` npm package) does not collect, store
or send any personal data or browsing data.

## What it reads

- On every page, a small script checks whether the page runs a MotifJS app in development mode, by watching for the
  `__MOTIF_DEVTOOLS__` object that `app.useDevelopment(true)` creates. It reads nothing else on the page.
- While the MotifJS tab is open in DevTools, the extension reads the inspected app's component tree, state, routes,
  services, warnings and errors through that object to show them in the panel.

## Where the data goes

The data moves only between the inspected page and the DevTools panel on the same computer, inside the browser. It is
never sent to a server, never shared with anyone, and never kept after the panel or the page closes. Only the panel's
own settings (theme, dock position) are saved in the browser's local storage.

## Permissions

- **Access to all websites:** a MotifJS app can run on any address (localhost, a staging server, a file), so the
  extension needs to look for it on every page.
- **Scripting:** to add the bridge to the inspected page when the MotifJS tab opens.

## Contact

Questions about this policy: [open an issue](https://github.com/motifjs-community/motifjs-devtools/issues).
