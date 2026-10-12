import { applyApiHeaders } from "@/server/http/headers";
import { methodNotAllowedResponse, notFoundResponse, stripBodyForHead } from "@/server/routes/define-route";

export function optionsResponse(): Response {
  const res = new Response(null, { status: 204 });
  res.headers.set("Allow", "GET, HEAD, OPTIONS");
  applyApiHeaders(res.headers);
  return res;
}

export function methodResponse(method: string): Response | null {
  if (method === "OPTIONS") return optionsResponse();
  if (method !== "GET" && method !== "HEAD") return methodNotAllowedResponse();
  return null;
}

export function notFoundForMethod(method: string): Response {
  const res = notFoundResponse();
  return method === "HEAD" ? stripBodyForHead(res) : res;
}
