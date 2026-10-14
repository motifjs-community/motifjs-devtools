import { installDetector } from '../src/detect';

installDetector(window as unknown as Record<string, unknown>, (message) => window.postMessage(message, '*'));
