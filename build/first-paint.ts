import type { Plugin } from "vite";
import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../src/shared/config/storage.ts";
import { DOC_META } from "../src/shared/i18n/index.ts";
import { THEME_MODES } from "../src/shared/types/app.ts";

/**
 * The inline bootstrap in `index.html` resolves the stored theme and language before the SPA boots: a value that only
 * reached the store flashes the OS preference on first paint. That script cannot import TypeScript, so `index.html`
 * carries four placeholders and this plugin fills them from `src/shared` on the way out, in `vite dev` and the build.
 */

/** Filled with `JSON.stringify` of the boot values below; the script reads `boot.*` from it. */
const BOOT_TOKEN = "%MT_BOOT%";
/** `DOC_META[lang].html` for the document the html is authored in. */
const DOC_LANG_TOKEN = "%MT_DOC_LANG%";
/** `DOC_META[lang].og` / `.ogAlternate`. */
const DOC_LOCALE_TOKEN = "%MT_DOC_LOCALE%";
const DOC_LOCALE_ALTERNATE_TOKEN = "%MT_DOC_LOCALE_ALTERNATE%";

/** The two enums and the two scalar keys the bootstrap needs, in the shape the inline script indexes; `docLang` maps a language to the `lang` attribute `DOC_META` gives it. */
function bootValues() {
  return {
    storageKey: STORAGE_KEYS.settings,
    storageVersion: SETTINGS_STORAGE_VERSION,
    themeModes: THEME_MODES,
    languages: Object.keys(DOC_META),
    docLang: Object.fromEntries(Object.entries(DOC_META).map(([lang, meta]) => [lang, meta.html])),
  };
}

/** The html ships as the English document; the bootstrap swaps `lang` on the root element once it knows the reader's preference. */
const STATIC_DOC = DOC_META.en;

/** A missing placeholder means the injection point was edited away; fail the build rather than serve a literal `%MT_BOOT%`. */
function fill(html: string, token: string, value: string): string {
  if (!html.includes(token)) {
    throw new Error(`index.html: no ${token} placeholder to fill in`);
  }
  return html.replaceAll(token, value);
}

export function firstPaint(): Plugin {
  return {
    name: "modeltide:first-paint",
    transformIndexHtml: {
      // `pre` so the values are in place before Vite's own html asset handling sees the document.
      order: "pre",
      handler(html) {
        const withBoot = fill(html, BOOT_TOKEN, JSON.stringify(bootValues()));
        const withLang = fill(withBoot, DOC_LANG_TOKEN, STATIC_DOC.html);
        const withLocale = fill(withLang, DOC_LOCALE_TOKEN, STATIC_DOC.og);
        return fill(withLocale, DOC_LOCALE_ALTERNATE_TOKEN, STATIC_DOC.ogAlternate);
      },
    },
  };
}
