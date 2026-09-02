import { cors } from "hono/cors";
import { timeout } from "hono/timeout";
import { timing } from "hono/timing";
import { logger } from "hono/logger";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { registerRoutes } from "@/server/routes";
import type { RouteDef } from "@/server/routes";
import { ApiError } from "@/server/infra/errors";
import { ONE_MINUTE, ONE_DAY } from "@/shared/config";

/** Clamp an error status to a contentful HTTP status code for JSON responses. */
function clampStatus(status: number): ContentfulStatusCode {
  return (status >= 100 && status < 600 ? status : 500) as ContentfulStatusCode;
}

/** Build the Hono API app: logging/timing/timeout/CORS middleware plus the declarative route table. */
export function createApp(routeDefs: readonly RouteDef[]): Hono {
  const app = new Hono();

  // Cron warmup traffic (internal x-warmup header) is pure noise at a 4-minute
  // cadence and would eat the observability log quota — only real client requests
  // are logged.
  const httpLogger = logger();
  app.use("/api/*", async (c, next) => {
    if (c.req.header("x-warmup") === "1") return next();
    return httpLogger(c, next);
  });
  app.use("*", timing());
  // 60s headroom: the slowest handler (AA) chains an index fetch plus parallel
  // enrichment fetches (15s each), so the serial worst case must stay below this.
  app.use("/api/*", timeout(ONE_MINUTE));

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowMethods: ["GET", "HEAD", "OPTIONS"],
      allowHeaders: ["content-type"],
      maxAge: ONE_DAY / 1000, // maxAge is in seconds
    }),
  );

  registerRoutes(app, routeDefs);

  app.onError((err, c) => {
    // Map known API errors to their HTTP status (400 validation, 502 upstream);
    // anything else is treated as an unexpected 500.
    if (err instanceof ApiError) {
      const status = clampStatus(err.status);
      return c.json({ error: { code: status, message: err.message } }, status);
    }
    console.error("[unhandled]", c.req.method, c.req.path, err);
    return c.json({ error: { code: 500, message: "Internal server error" } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 404, message: "API route not found" } }, 404));

  return app;
}
