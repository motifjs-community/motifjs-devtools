import { startPanel } from '../../src/panel/start';
import { panelPort } from '../src/panelPort';

const devtools = typeof chrome !== 'undefined' ? chrome.devtools : undefined;
const tabId = devtools?.inspectedWindow.tabId ?? Number(new URLSearchParams(location.search).get('tabId'));

startPanel(panelPort(chrome.runtime, tabId), {
  systemTheme: () => (devtools === undefined ? null : devtools.panels.themeName === 'dark' ? 'dark' : 'light'),
});
