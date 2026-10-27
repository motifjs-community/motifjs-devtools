import { startPanel } from '../../src/panel/start';
import { extensionApi } from '../src/api';
import { PANEL_SHOWN_KEY } from '../src/messages';
import { panelPort } from '../src/panelPort';

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
const shownListeners = new Set<(shown: boolean) => void>();

(window as Window & { [PANEL_SHOWN_KEY]?: (shown: boolean) => void })[PANEL_SHOWN_KEY] = (shown) => {
  for (const listener of shownListeners) listener(shown);
};

startPanel(panelPort(extensionApi().runtime, Number(params.get('tabId'))), {
  systemTheme: () => (theme === 'dark' ? 'dark' : theme === null ? null : 'light'),
  shown: (listener) => {
    shownListeners.add(listener);
    return () => shownListeners.delete(listener);
  },
});
