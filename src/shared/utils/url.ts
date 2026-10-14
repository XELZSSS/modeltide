export function isHttpUrl(link: string): boolean {
  const t = link.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isProtocolRelative(href: string): boolean {
  return href.startsWith("//") || href.startsWith("/\\");
}

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f\ufeff]/g; // oxlint-disable-line no-control-regex -- intentional URL sanitizer

function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS_RE, "");
}

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = stripControlChars(url);
  if (!cleaned) return undefined;
  if (isProtocolRelative(cleaned)) return undefined;
  if (cleaned.startsWith("/")) return cleaned;
  return isHttpUrl(cleaned) ? cleaned : undefined;
}

export function isInternalHref(href: string, origin: string): boolean {
  if (!href || href.startsWith("#") || isProtocolRelative(href)) return false;
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}
