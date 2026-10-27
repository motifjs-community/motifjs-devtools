export const DETECT_SOURCE = 'motif-devtools:detect';
export const PAGE_SOURCE = 'motif-devtools:page';
export const CONTENT_SOURCE = 'motif-devtools:content';
export const BRIDGE_KEY = '__MOTIF_DEVTOOLS_BRIDGE__';
export const PANEL_SHOWN_KEY = '__MOTIF_DEVTOOLS_SHOWN__';
export const PANEL_PREFIX = 'panel:';
export const CONTENT_PORT = 'content';

export type Detection = { found: boolean; version: number | null; coreVersion: string | null };

export type DetectMessage = { source: typeof DETECT_SOURCE } & Detection;
export type PageMessage = { source: typeof PAGE_SOURCE; message: unknown };
export type ContentMessage = { source: typeof CONTENT_SOURCE; message?: unknown; stop?: true };

export type RuntimeMessage = { type: 'detected' } & Detection | { type: 'connect' };

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function detectionOf(api: unknown): Detection {
  if (!isObject(api) || typeof api.on !== 'function') return { found: false, version: null, coreVersion: null };
  return {
    found: true,
    version: typeof api.version === 'number' ? api.version : null,
    coreVersion: typeof api.coreVersion === 'string' ? api.coreVersion : null,
  };
}
