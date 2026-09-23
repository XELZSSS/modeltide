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
