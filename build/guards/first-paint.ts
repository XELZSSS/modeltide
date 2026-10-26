import { SETTINGS_STORAGE_VERSION, STORAGE_KEYS } from "../../src/shared/config/storage.ts";
import { DOC_META } from "../../src/shared/i18n/index.ts";
import { THEME_MODES } from "../../src/shared/types/app.ts";
import type { GuardContext, GuardRule } from "./context.ts";

const SETTINGS_KEY_READ = /localStorage\.getItem\("([^"]+)"\)/;
const SETTINGS_VERSION_CHECK = /\.version\s*===\s*(\d+)/;

/**
 * `index.html` resolves the stored preference before the SPA boots, so it carries its own copy of the theme enum, the
 * language enum and the document locale. A value that only reached the store flashes the OS preference (or the wrong
 * language) on first paint, and nothing else in the build sees it: types and the suite never read the html.
 */
function assertFirstPaintEnums(html: string): void {
  for (const mode of THEME_MODES) {
    if (!html.includes(`st.themeMode === "${mode}"`)) {
      throw new Error(`index.html: first paint does not accept themeMode "${mode}" from THEME_MODES`);
    }
  }
  for (const lang of Object.keys(DOC_META)) {
    if (!html.includes(`st.lang === "${lang}"`)) {
      throw new Error(`index.html: first paint does not accept lang "${lang}" from DOC_META`);
    }
  }
  const resolvedLang = `resolved === "zh" ? "${DOC_META.zh.html}" : "${DOC_META.en.html}"`;
  if (!html.includes(resolvedLang)) {
    throw new Error(
      `index.html: first paint maps a language to html lang as DOC_META would not: expected ${resolvedLang}`,
    );
  }
  if (!html.includes(`<html lang="${DOC_META.en.html}">`)) {
    throw new Error(`index.html: the static lang attribute is not DOC_META.en.html ("${DOC_META.en.html}")`);
  }
  const locale = `content="${DOC_META.en.og}"`;
  const alternate = `content="${DOC_META.en.ogAlternate}"`;
  if (!html.includes(locale) || !html.includes(alternate)) {
    throw new Error(`index.html: og:locale / og:locale:alternate are not ${locale} and ${alternate} from DOC_META.en`);
  }
}

/**
 * The first paint's contract: the settings key and storage version the html reads, plus the theme and language enums it
 * accepts. A store that persists a new version while the html still accepts the old one drops every reader's saved
 * preference on the next load, which no type and no test can observe.
 */
export const firstPaintRule: GuardRule = {
  id: "first-paint",
  watches: ["index.html", "src/shared/config/storage.ts", "src/shared/types/app.ts", "src/shared/i18n/index.ts"],
  run(ctx: GuardContext) {
    const html = ctx.readText("index.html");
    const key = SETTINGS_KEY_READ.exec(html)?.[1];
    if (key !== STORAGE_KEYS.settings) {
      throw new Error(
        `index.html: reads localStorage "${key ?? "no key"}", but the settings key is "${STORAGE_KEYS.settings}"`,
      );
    }
    const version = SETTINGS_VERSION_CHECK.exec(html)?.[1];
    if (version !== String(SETTINGS_STORAGE_VERSION)) {
      throw new Error(
        `index.html: accepts settings version ${version ?? "none"}, but the settings store persists ${SETTINGS_STORAGE_VERSION}`,
      );
    }
    assertFirstPaintEnums(html);
  },
};
