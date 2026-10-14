export const extensionApi = (): typeof chrome => (typeof browser !== 'undefined' && browser !== undefined ? browser : chrome);
