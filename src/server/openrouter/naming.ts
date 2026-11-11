import type { OpenRouterRankEntry } from "@/shared/types";
import { capLabel } from "@/server/formats/scalars";

const CREATORS: Record<string, string> = {
  anthropic: "Anthropic",
  "arcee-ai": "Arcee AI",
  assemblyai: "AssemblyAI",
  baai: "BAAI",
  bytedance: "ByteDance",
  "bytedance-seed": "ByteDance Seed",
  canopylabs: "Canopy Labs",
  cerebras: "Cerebras",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  elevenlabs: "ElevenLabs",
  fireworks: "Fireworks",
  google: "Google",
  groq: "Groq",
  heygen: "HeyGen",
  "ibm-granite": "IBM Granite",
  inclusionai: "InclusionAI",
  intfloat: "intfloat",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  moonshot: "Moonshot",
  moonshotai: "Moonshot AI",
  "nace-ai": "Nace AI",
  "nex-agi": "Nex AGI",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  "prism-ml": "Prism ML",
  qwen: "Qwen",
  rekaai: "Reka",
  scaledown: "ScaleDown",
  stepfun: "StepFun",
  thedrummer: "TheDrummer",
  thinkingmachines: "Thinking Machines",
  togethercomputer: "Together",
  voyageai: "Voyage AI",
  "x-ai": "xAI",
  xai: "xAI",
  xiaomi: "Xiaomi",
  "z-ai": "Z.ai",
  zhipu: "Zhipu",
};

export function creatorFromSlug(slug: unknown): string {
  if (typeof slug !== "string" || !slug.trim()) return "Unknown";
  const slashAt = slug.indexOf("/");
  if (slashAt <= 0) return "Unknown";
  const owner = slug.slice(0, slashAt).trim();
  if (!owner) return "Unknown";
  const lower = owner.toLowerCase();
  if (Object.hasOwn(CREATORS, lower)) return CREATORS[lower]!;
  // The owner goes over whole: `capLabel` capitalizes it as it stands, so token-splitting it would build an array nothing reads.
  return capLabel(owner);
}

const CODING_RE = /\b(?:coder|coding|code|codex)\b/;
const REASONING_RE = /\b(?:reasoning|thought)\b/;
const REASONING_SUFFIX_RE = /-(?:r1|o1)\b/;

function categoryOf(text: string): OpenRouterRankEntry["category"] | null {
  const v = text.toLowerCase();
  if (CODING_RE.test(v)) return "coding";
  if (REASONING_RE.test(v) || REASONING_SUFFIX_RE.test(v)) return "reasoning";
  return null;
}

export function categoryFrom(slug: unknown, name: unknown): OpenRouterRankEntry["category"] {
  if (typeof slug === "string" && slug) {
    const fromSlug = categoryOf(slug);
    if (fromSlug) return fromSlug;
  }
  if (typeof name === "string" && name) {
    const fromName = categoryOf(name);
    if (fromName) return fromName;
  }
  return "general";
}

/** The whitespace `/[-\s]+/` in the chain this replaced also matched above ASCII; a permaslug never has one. */
const UNICODE_SPACE_RE = /\s/;

/** `: / _ -`, plus the ASCII whitespace codes, without building a string to compare against. */
function isSlugSeparator(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code === 0x2f || code === 0x3a || code === 0x5f || code === 0x2d) return true;
  if (code === 0x20) return true;
  if (code < 0x20) return code >= 0x09 && code <= 0x0d;
  return code > 0x7f && UNICODE_SPACE_RE.test(ch);
}

/** One slug token, cased the way the model cards spell it: digit-led stays lower, three characters or fewer upper. */
function formatToken(token: string): string {
  if (/^\d/.test(token)) return token.toLowerCase();
  if (token.length <= 3) return token.toUpperCase();
  return capLabel(token);
}

/**
 * The model's display name from its permaslug: the part after the owner, split on `: / _ -` and whitespace, each token
 * shaped by `formatToken`. Hand-written rather than a `split`/`replace`/`map`/`join` chain: that rebuilt an array per row
 * of a refresh, where this walks the string once.
 */
export function titleFromSlug(permaslug: string): string {
  const ownerEnd = permaslug.indexOf("/");
  const model = ownerEnd === -1 ? permaslug : permaslug.slice(ownerEnd + 1);
  const source = model === "" ? permaslug : model;
  let out = "";
  let start = -1;
  for (let i = 0; i <= source.length; i++) {
    if (i < source.length && !isSlugSeparator(source[i]!)) {
      if (start === -1) start = i;
      continue;
    }
    if (start === -1) continue;
    const token = source.slice(start, i);
    start = -1;
    const formatted = formatToken(token);
    out = out === "" ? formatted : `${out} ${formatted}`;
  }
  return out;
}
