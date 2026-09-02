import { cors } from "hono/cors";
import { timeout } from "hono/timeout";
import { timing } from "hono/timing";
import { logger } from "hono/logger";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { registerRoutes } from "@/server/routes";
import type { RouteDef } from "@/server/routes";
import { ApiError } from "@/server/infra/errors";
import { ONE_DAY, WARM_ORIGIN } from "@/shared/config";

// Workers kills requests at ~30s wall-clock, so fail fast with 504 before that.
// (AA chains index + parallel enrichment fetches; upstream timeouts keep it under this.)
const ROUTE_TIMEOUT_MS = 25_000;
const WARM_HOST = new URL(WARM_ORIGIN).host;

/** Clamp an error status to a contentful HTTP status code for JSON responses. */
function clampStatus(status: number): ContentfulStatusCode {
  return (status >= 100 && status < 600 ? status : 500) as ContentfulStatusCode;
}

/** Build the Hono API app: logging/timing/timeout/CORS middleware plus the declarative route table. */
export function createApp(routeDefs: readonly RouteDef[]): Hono {
  const app = new Hono();

  // Cron warmup traffic (internal x-warmup header) is pure noise at a 30-minute
  // cadence and would eat the observability log quota — only real client requests
  // are logged. The host check keeps external clients from forging the header
  // to go unlogged: internal warmup calls always target WARM_ORIGIN.
  const httpLogger = logger();
  app.use("/api/*", async (c, next) => {
    if (c.req.header("x-warmup") === "1" && new URL(c.req.url).host === WARM_HOST) return next();
    return httpLogger(c, next);
  });
  // CORS first so OPTIONS preflights skip timeout/logging guards. Same-Worker
  // static hosting doesn't need CORS; kept permissive for GET-only public API.
  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "HEAD", "OPTIONS"],
      allowHeaders: ["content-type"],
      maxAge: ONE_DAY / 1000,
    }),
  );
  app.use("*", timing());
  // Cheap global DoS guard: route schemas only validate known params, so cap
  // total URL length and unknown-param count before Hono parses them.
  app.use("/api/*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.toString().length > 2048 || url.pathname.length > 512 || [...url.searchParams.keys()].length > 20) {
      return c.json({ error: { code: 400, message: "Bad request" } }, 400);
    }
    await next();
  });
  app.use("/api/*", timeout(ROUTE_TIMEOUT_MS));
  // Security headers for API responses (static assets get theirs from _headers).
  app.use("/api/*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
  });

  registerRoutes(app, routeDefs);

  app.onError((err, c) => {
    // Map known API errors to their HTTP status (400 validation, 502 upstream);
    // anything else is treated as an unexpected 500.
    // Upstream details (URLs, payload shapes) stay server-side in logs — clients
    // get a generic message to avoid leaking internal topology.
    if (err instanceof ApiError) {
      const status = clampStatus(err.status);
      if (status === 502) {
        console.warn("[upstream]", c.req.method, c.req.path, err.message);
        return c.json({ error: { code: status, message: "Upstream data source temporarily unavailable" } }, status);
      }
      return c.json({ error: { code: status, message: err.message } }, status);
    }
    // hono/timeout throws HTTPException 408 — surface as 504 so clients can retry.
    if (err instanceof HTTPException && err.status === 408) {
      return c.json({ error: { code: 504, message: "Upstream request timed out" } }, 504);
    }
    if (err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(err.message))) {
      return c.json({ error: { code: 504, message: "Upstream request timed out" } }, 504);
    }
    console.error("[unhandled]", c.req.method, c.req.path, err);
    return c.json({ error: { code: 500, message: "Internal server error" } }, 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith("/api")) {
      return c.json({ error: { code: 404, message: "API route not found" } }, 404);
    }
    return c.json({ error: { code: 404, message: "Not found" } }, 404);
  });

  return app;
}
