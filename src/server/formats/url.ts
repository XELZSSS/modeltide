/**
 * The comparable form of a news link, or `null` when the string is not a URL at all.
 *
 * Both branches used to collapse a parse failure into a plausible-looking value — the raw text for the dedupe key, and
 * the literal `"Unknown"` for a channel host — so an unparseable link entered the payload and a broken feed printed a
 * fake source name. The caller now decides what to do with a `null`: the news source drops the item and counts it.
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
