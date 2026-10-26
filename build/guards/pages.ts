import type { GuardContext, GuardRule } from "./context.ts";

/**
 * Pages parses `public/_headers`, `public/_redirects` and `public/_routes.json` itself, at deploy time; Vite only
 * copies them. A malformed block, a rule count past the documented limit or a redirect that reaches into the API
 * prefix is therefore invisible to type-check and lint, and surfaces as a production 404 instead. The security-header
 * ban is AGENTS.md's first rule, and nothing else enforced it.
 */
const SECURITY_HEADER_NAMES =
  /^(?:content-security-policy(?:-report-only)?|x-frame-options|x-content-type-options|referrer-policy|strict-transport-security|permissions-policy|feature-policy|cross-origin-(?:opener|embedder|resource)-policy|x-xss-protection)$/i;

/** Documented Pages limits: platform/limits (headers, redirects) and functions/routing (invocation routes). */
const HEADERS_MAX_RULES = 100;
const HEADERS_MAX_LINE_CHARS = 2000;
const ROUTES_MAX_RULES = 100;
const ROUTES_MAX_RULE_CHARS = 100;
const REDIRECTS_MAX_STATIC = 2000;
const REDIRECTS_MAX_DYNAMIC = 100;

interface PagesFileLine {
  /** The line with surrounding whitespace removed. */
  text: string;
  /** Both `_headers` and `_redirects` use leading whitespace to mean "attached to the line above". */
  indented: boolean;
}

function pagesFileLines(source: string): PagesFileLine[] {
  const lines: PagesFileLine[] = [];
  for (const raw of source.split("\n")) {
    const text = raw.trim();
    if (text === "" || text.startsWith("#")) continue;
    lines.push({ text, indented: /^\s/.test(raw) });
  }
  return lines;
}

function assertPagesHeaders(source: string): void {
  const lines = pagesFileLines(source);
  let rules = 0;
  for (const { text, indented } of lines) {
    if (!indented) rules += 1;
    if (text.length > HEADERS_MAX_LINE_CHARS) {
      throw new Error(
        `public/_headers: a line is ${text.length} chars, above the ${HEADERS_MAX_LINE_CHARS} Pages limit`,
      );
    }
    // `! Name` detaches a header, and the name is what decides whether this is one of the banned ones.
    const name = /^!?\s*([A-Za-z0-9-]+)\s*:/.exec(text)?.[1];
    if (name !== undefined && SECURITY_HEADER_NAMES.test(name)) {
      throw new Error(
        `public/_headers: "${name}" is a security/policy header, which this repository deliberately does not send - ` +
          "Cloudflare Pages owns the edge policy. See AGENTS.md.",
      );
    }
  }
  if (rules > HEADERS_MAX_RULES) {
    throw new Error(`public/_headers: ${rules} rules, above the ${HEADERS_MAX_RULES} Pages limit`);
  }
}

interface PagesRoutes {
  version: number;
  include: string[];
  exclude: string[];
}

function assertPagesRoutes(source: string, apiPrefix: string): void {
  const routes = JSON.parse(source) as PagesRoutes;
  if (routes.version !== 1) {
    throw new Error(`public/_routes.json: version ${routes.version}, expected 1`);
  }
  if (routes.include.length === 0) {
    throw new Error(
      "public/_routes.json: at least one include rule is required - with none, Pages invokes a Function for every " +
        "request, so static assets stop being free and unlimited",
    );
  }
  const rules = [...routes.include, ...routes.exclude];
  if (rules.length > ROUTES_MAX_RULES) {
    throw new Error(`public/_routes.json: ${rules.length} rules, above the ${ROUTES_MAX_RULES} Pages limit`);
  }
  for (const rule of rules) {
    if (!rule.startsWith("/")) {
      throw new Error(`public/_routes.json: "${rule}" is not an absolute path rule`);
    }
    if (rule.length > ROUTES_MAX_RULE_CHARS) {
      throw new Error(`public/_routes.json: "${rule}" is longer than the ${ROUTES_MAX_RULE_CHARS} character limit`);
    }
  }
  // Every invoked route has to sit under the API prefix: an include rule on a page path makes that page run through a
  // Function, which is exactly what this file exists to prevent.
  const stray = routes.include.filter((rule) => !rule.startsWith(`${apiPrefix}/`));
  if (stray.length > 0) {
    throw new Error(
      `public/_routes.json: include rule(s) outside "${apiPrefix}/": ${stray.join(", ")} - a page path that invokes ` +
        "a Function is exactly what this file exists to prevent",
    );
  }
}

function assertPagesRedirects(source: string, apiPrefix: string): void {
  const lines = pagesFileLines(source);
  let dynamic = 0;
  for (const { text } of lines) {
    const [from, to, code] = text.split(/\s+/);
    if (from === undefined || to === undefined) {
      throw new Error(`public/_redirects: "${text}" is not a "source destination [code]" rule`);
    }
    // Pages applies `_redirects` while serving the static side of the request, so a rule that reaches into the API
    // prefix answers an /api URL with the SPA shell instead of letting `functions/api/` handle it.
    if (from === apiPrefix || from.startsWith(`${apiPrefix}/`) || from.startsWith(`${apiPrefix}*`)) {
      throw new Error(`public/_redirects: "${from}" would answer an API URL with the SPA shell`);
    }
    if (code !== undefined && !/^[1-9]\d\d$/.test(code)) {
      throw new Error(`public/_redirects: "${text}" has status "${code}", expected a three-digit code`);
    }
    if (from.includes("*") || from.includes(":")) dynamic += 1;
  }
  const staticCount = lines.length - dynamic;
  if (staticCount > REDIRECTS_MAX_STATIC || dynamic > REDIRECTS_MAX_DYNAMIC) {
    throw new Error(
      `public/_redirects: ${staticCount} static and ${dynamic} dynamic rules, above the ` +
        `${REDIRECTS_MAX_STATIC}/${REDIRECTS_MAX_DYNAMIC} Pages limits`,
    );
  }
}

/**
 * The three files Cloudflare Pages parses at deploy time, which no other check reads: `_headers` may not carry a
 * security or policy header, `_routes.json` may only invoke a Function under the API prefix, and `_redirects` may not
 * answer an API URL with the SPA shell. `apiPrefix` is passed in rather than imported so this rule stays a pure function
 * of the bytes it is handed.
 */
export function pagesRule(apiPrefix: string): GuardRule {
  return {
    id: "pages",
    watches: ["public/_headers", "public/_routes.json", "public/_redirects"],
    run(ctx: GuardContext) {
      assertPagesHeaders(ctx.readText("public/_headers"));
      assertPagesRoutes(ctx.readText("public/_routes.json"), apiPrefix);
      assertPagesRedirects(ctx.readText("public/_redirects"), apiPrefix);
    },
  };
}

/** Pads each segment so a plain string comparison orders `10.0.0` above `9.0.0`. */
function paddedVersion(version: string): string {
  return version
    .split(".")
    .map((part) => part.padStart(6, "0"))
    .join(".");
}

/**
 * The Pages v3 build image ships Node 22.16.0 and cannot read `engines.node` - a documented v3 limitation - so the
 * version this project needs only reaches the build through `.nvmrc` / `.node-version`. `.npmrc` sets `engine-strict`,
 * which turns a mismatch into a failed install with an obscure message; asserting the floor here names both files.
 */
function assertBuildNodeVersion(ctx: GuardContext): void {
  const nvmrc = ctx.readText(".nvmrc").trim();
  const nodeVersion = ctx.readText(".node-version").trim();
  if (nvmrc !== nodeVersion) {
    throw new Error(`.nvmrc (${nvmrc}) and .node-version (${nodeVersion}) disagree, and Pages reads both`);
  }
  const engines = (JSON.parse(ctx.readText("package.json")) as { engines?: { node?: string } }).engines?.node;
  const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(engines ?? "")?.[1];
  if (floor === undefined) {
    throw new Error(`package.json: engines.node "${engines ?? "none"}" is not of the form ">=X.Y.Z"`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(nvmrc)) {
    throw new Error(`.nvmrc: "${nvmrc}" is not of the form X.Y.Z, which the Pages build image needs`);
  }
  if (paddedVersion(nvmrc) < paddedVersion(floor)) {
    throw new Error(`.nvmrc pins Node ${nvmrc}, below the ${engines ?? ""} floor in package.json`);
  }
}

/**
 * The Node floor the build image has to meet, and the service worker's copy of the API prefix. Both live in files no
 * compiler reads: `.nvmrc` / `.node-version` are read by Pages, and `sw.js` is plain JavaScript copied verbatim.
 */
export const runtimeRule: GuardRule = {
  id: "runtime",
  watches: [".nvmrc", ".node-version", "package.json", "public/sw.js"],
  run(ctx: GuardContext) {
    assertBuildNodeVersion(ctx);
    const prefix = apiPrefixOf(ctx);
    if (!ctx.readText("public/sw.js").includes(`const API_PREFIX = "${prefix}"`)) {
      throw new Error(`public/sw.js: API_PREFIX drifted from src/shared/config/api.ts ("${prefix}")`);
    }
  },
};

/**
 * The service worker cannot import TypeScript, so it restates the prefix. Reading it from the source that owns it
 * keeps the two in one place: `build/constants.ts` re-exports `API_PREFIX` from `src/shared/config/api.ts`.
 */
function apiPrefixOf(ctx: GuardContext): string {
  const decl = /export const API_PREFIX = "([^"]+)";/.exec(ctx.readText("src/shared/config/api.ts"))?.[1];
  if (decl === undefined) throw new Error("src/shared/config/api.ts: API_PREFIX declaration not found");
  return decl;
}
