const PROBE = '(() => { const d = window.__MOTIF_DEVTOOLS__; return typeof d === "object" && d !== null && typeof d.on === "function"; })()';

let created = false;

const check = () => {
  if (created) return;
  chrome.devtools.inspectedWindow.eval<boolean>(PROBE, (found) => {
    if (found !== true || created) return;
    created = true;
    chrome.devtools.panels.create('MotifJS', 'icons/active-32.png', 'panel.html');
  });
};

check();
const timer = setInterval(() => (created ? clearInterval(timer) : check()), 1000);
chrome.devtools.network.onNavigated.addListener(check);
