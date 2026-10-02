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

export function isProtocolRelative(href: string): boolean {
  return href.startsWith("//") || href.startsWith("/\\");
}

export function isInternalHref(href: string, origin: string): boolean {
  if (!href || href.startsWith("#") || isProtocolRelative(href)) return false;
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}
