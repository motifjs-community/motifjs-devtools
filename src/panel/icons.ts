const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  logo: '<svg viewBox="0 0 236 236" width="22" height="22" fill="#8B7CFF" aria-hidden="true"><path d="M118 20 158 60 136 82 118 64 100 82 78 60Z"/><path d="m216 118-40 40-22-22 18-18-18-18 22-22Z"/><path d="m118 216-40-40 22-22 18 18 18-18 22 22Z"/><path d="m20 118 40-40 22 22-18 18 18 18-22 22Z"/></svg>',
  elements: svg('<path d="M8 1.8 14 5 8 8.2 2 5z"/><path d="m2 8 6 3.2L14 8"/><path d="m2 11 6 3.2 6-3.2"/>'),
  reactivity: svg('<path d="M1.5 8h3l1.5-4 3 8 1.5-4h4"/>'),
  router: svg('<circle cx="3.5" cy="12.5" r="1.5"/><circle cx="12.5" cy="3.5" r="1.5"/><path d="M5 12.5h3.5a2.5 2.5 0 0 0 0-5h-1a2.5 2.5 0 0 1 0-5H11"/>'),
  stores: svg('<ellipse cx="8" cy="3.5" rx="5.5" ry="2"/><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9"/><path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>'),
  logs: svg('<path d="m2.5 4.5 3 3-3 3"/><path d="M7.5 11.5h6"/>'),
  system: svg('<rect x="1.5" y="2.5" width="13" height="9" rx="1.5"/><path d="M5.5 14h5M8 11.5V14"/>'),
  light: svg('<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/>'),
  dark: svg('<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/>'),
  dockBottom: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 9.5h13"/>'),
  dockRight: svg('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M9.5 2.5v11"/>'),
  popout: svg('<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/><path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>'),
  pick: svg('<path d="M3 2.5 12.5 7 8.3 8.3 7 12.5z"/><path d="m8.5 8.5 4.5 4.5"/>'),
  bolt: svg('<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>'),
} as const;
