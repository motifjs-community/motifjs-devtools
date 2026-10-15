export const LOGO_SVG = '<svg viewBox="0 0 236 236" width="22" height="22" aria-hidden="true"><path fill="#ff8f66" d="M118 0 236 118 174 118 118 62 62 118 0 118Z"/><path fill="#f8f7f3" d="M118 236 0 118 62 118 118 174 174 118 236 118Z"/></svg>';

export const HOST_STYLES = `
:host { all: initial; }
.toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(127,127,127,.35);
  background: #1e1e1e; display: grid; place-items: center; cursor: pointer; padding: 0;
  box-shadow: 0 4px 14px rgba(0,0,0,.28);
}
.toggle:hover { background: #2a2a2a; }
.toggle:focus-visible { outline: 2px solid #4fc1ff; outline-offset: 2px; }
:host([data-open='true'][data-position='bottom']) .toggle { bottom: calc(var(--dock-height) + 16px); }
:host([data-open='true'][data-position='right']) .toggle { right: calc(var(--dock-width) + 16px); }
.dock {
  position: fixed; z-index: 2147483647; display: flex; background: #1e1e1e;
}
.dock[hidden] { display: none; }
.dock[data-position='bottom'] { left: 0; right: 0; bottom: 0; flex-direction: column; box-shadow: 0 -6px 20px rgba(0,0,0,.25); }
.dock[data-position='right'] { top: 0; right: 0; bottom: 0; flex-direction: row; box-shadow: -6px 0 20px rgba(0,0,0,.25); }
.resizer { flex: none; background: rgba(127,127,127,.25); touch-action: none; }
.dock[data-position='bottom'] .resizer { height: 5px; cursor: ns-resize; }
.dock[data-position='right'] .resizer { width: 5px; cursor: ew-resize; }
.resizer:hover { background: #4fc1ff; }
iframe { flex: 1; min-width: 0; min-height: 0; border: 0; display: block; background: transparent; color-scheme: normal; }
`;
