import { windowPort } from '../transport/window';
import { startPanel } from './start';

const peer = () => (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null);
startPanel(windowPort(window, peer));
