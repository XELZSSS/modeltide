export const FONT_FILES = [
  "/fonts/plex-sans-latin.woff2",
  "/fonts/plex-sans-latin-ext.woff2",
  "/fonts/plex-mono-400-latin.woff2",
  "/fonts/plex-mono-500-latin.woff2",
  "/fonts/plex-mono-600-latin.woff2",
] as const;

const ICON_FILES = [
  "/icons/app-icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
] as const;

export const PRECACHE_URLS = ["/", "/manifest.webmanifest", ...FONT_FILES, ...ICON_FILES] as const;

export const FONT_LOAD_SPECS = [
  '400 1em "IBM Plex Sans"',
  '600 1em "IBM Plex Sans"',
  '400 1em "IBM Plex Mono"',
  '500 1em "IBM Plex Mono"',
  '600 1em "IBM Plex Mono"',
] as const;
