/**
 * The comparable form of a news link, or `null` when the string is not a URL at all. The caller decides what to do with
 * a `null`: the news source drops the item and counts it, so an unparseable link never enters the payload.
 */
export function normalizeNewsLink(link: string): string | null {
  try {
    const u = new URL(link.trim());
    const port = u.port ? `:${u.port}` : "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${port}${u.pathname.replace(/\/+$/, "") || "/"}${u.search}`;
  } catch {
    return null;
  }
}

/** The channel host a feed's items are attributed to, or `null` when the feed URL itself is unparseable. */
export function sourceNameFromUrl(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return null;
  }
}
