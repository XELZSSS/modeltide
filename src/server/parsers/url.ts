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
