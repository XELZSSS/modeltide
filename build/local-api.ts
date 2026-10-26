import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { API_PREFIX, FUNCTIONS_ROUTE } from "./constants.ts";
import { errMsg } from "../src/shared/utils/text.ts";

function nodeHeadersToWeb(headers: IncomingMessage["headers"]): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) out.append(key, v);
    } else {
      out.set(key, value);
    }
  }
  return out;
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 0) res.setHeader("content-length", body.length);
  res.end(body);
}

export function localApi(): Plugin {
  return {
    name: "modeltide:local-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "/";
          const url = new URL(rawUrl, "http://localhost");
          if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return next();
          const mod = (await server.ssrLoadModule(FUNCTIONS_ROUTE)) as {
            onRequest: (ctx: {
              request: Request;
              env: Record<string, never>;
              waitUntil: (work: Promise<unknown>) => void;
            }) => Promise<Response>;
          };
          const request = new Request(`http://localhost${rawUrl}`, {
            method: req.method,
            headers: nodeHeadersToWeb(req.headers),
          });
          const response = await mod.onRequest({
            request,
            env: {},
            // Mirrors the Pages host: detached cache refreshes outlive the response. A failure inside one is reported here
            // as well — a detached promise that rejects after the handler returned used to be dropped on the floor, which
            // hid it from everyone but the refresh runner's own log line.
            waitUntil: (work) =>
              void work.catch((err: unknown) => {
                console.warn(`[dev-api] detached work failed: ${errMsg(err)}`);
              }),
          });
          await writeWebResponse(response, res);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
