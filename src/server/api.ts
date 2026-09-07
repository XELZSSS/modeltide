import { cors } from "hono/cors";
import { timeout } from "hono/timeout";
import { timing } from "hono/timing";
import { logger } from "hono/logger";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { registerRoutes } from "@/server/routes/table";
import type { RouteDef } from "@/server/routes/table";
import { ApiError, RateLimitError } from "@/server/infra/errors";
import { ONE_DAY } from "@/shared/config";
import { sanitizeLogLine } from "@/server/context";
import { isWarmupRequest } from "@/server/routes/warmup";
import type { Env } from "@/server/context";

const ROUTE_TIMEOUT_MS = 25_000;

function clampStatus(status: number): ContentfulStatusCode {
  return (status >= 100 && status < 600 ? status : 500) as ContentfulStatusCode;
}

function setSecurityHeaders(c: Context): void {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

const PUBLIC_API_CORS_ORIGIN = "*";

export function createApp(routeDefs: readonly RouteDef[]): Hono {
  const app = new Hono();

  const httpLogger = logger();
  app.use("/api/*", async (c, next) => {
    if (isWarmupRequest(c, c.env as Env)) return next();
    return httpLogger(c, next);
  });
  app.use(
    "/api/*",
    cors({
      origin: PUBLIC_API_CORS_ORIGIN,
      allowMethods: ["GET", "HEAD", "OPTIONS"],
      allowHeaders: ["content-type"],
      maxAge: ONE_DAY / 1000,
    }),
  );
  app.use("*", timing());
  app.use("/api/*", async (c, next) => {
    if (c.req.url.length > 2048) {
      return c.json({ error: { code: 400, message: "Bad request" } }, 400);
    }
    let url: URL;
    try {
      url = new URL(c.req.url);
    } catch {
      return c.json({ error: { code: 400, message: "Bad request" } }, 400);
    }
    if (url.pathname.length > 512 || [...url.searchParams.keys()].length > 20) {
      return c.json({ error: { code: 400, message: "Bad request" } }, 400);
    }
    await next();
  });
  app.use("/api/*", timeout(ROUTE_TIMEOUT_MS));
  app.use("/api/*", async (c, next) => {
    await next();
    setSecurityHeaders(c);
  });

  registerRoutes(app, routeDefs);

  app.onError((err, c) => {
    setSecurityHeaders(c);
    if (err instanceof ApiError) {
      const status = clampStatus(err.status);
      if (err instanceof RateLimitError && err.retryAfterSec != null) {
        c.header("Retry-After", String(err.retryAfterSec));
      }
      if (status === 502) {
        console.warn(sanitizeLogLine(`[upstream] ${c.req.method} ${c.req.path} ${err.message}`));
        return c.json({ error: { code: status, message: "Upstream data source temporarily unavailable" } }, status);
      }
      return c.json({ error: { code: status, message: err.message } }, status);
    }
    if (err instanceof HTTPException && err.status === 408) {
      return c.json({ error: { code: 504, message: "Upstream request timed out" } }, 504);
    }
    if (err instanceof Error && (err.name === "TimeoutError" || /timeout/i.test(err.message))) {
      return c.json({ error: { code: 504, message: "Upstream request timed out" } }, 504);
    }
    console.error(
      sanitizeLogLine(`[unhandled] ${c.req.method} ${c.req.path} ${err instanceof Error ? err.message : String(err)}`),
    );
    return c.json({ error: { code: 500, message: "Internal server error" } }, 500);
  });

  app.notFound((c) => {
    setSecurityHeaders(c);
    if (c.req.path.startsWith("/api")) {
      return c.json({ error: { code: 404, message: "API route not found" } }, 404);
    }
    return c.json({ error: { code: 404, message: "Not found" } }, 404);
  });

  return app;
}
