import { NAMED_ENTITIES } from "./html-entity-table";

const ENTITY_RE = /&(?:#x([0-9a-fA-F]+);?|#([0-9]+);?|([a-zA-Z][a-zA-Z0-9]*);)/g;

export function decodeEntities(s: unknown): string {
  if (typeof s !== "string") return "";
  if (!s.includes("&")) return s;
  return s.replace(ENTITY_RE, (m, hex?: string, dec?: string, name?: string) => {
    if (hex) return safeFromCodePoint(parseInt(hex, 16));
    if (dec) return safeFromCodePoint(parseInt(dec, 10));
    if (name && Object.hasOwn(NAMED_ENTITIES, name)) return NAMED_ENTITIES[name] ?? m;
    return m;
  });
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return "";
  if (cp >= 0xd800 && cp <= 0xdfff) return "";
  return String.fromCodePoint(cp);
}
