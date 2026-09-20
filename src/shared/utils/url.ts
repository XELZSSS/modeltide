export function normalizeNewsLink(link: string): string {
  const trimmed = link.trim();
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}${u.hash}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function sourceNameFromUrl(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "Unknown";
  }
}

export function isInternalHref(href: string, origin: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("//") || href.startsWith("/\\")) return false;
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}
