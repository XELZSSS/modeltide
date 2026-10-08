import { utf8ByteLength } from "@/server/infra/hash";
import { UpstreamError, errMsg } from "@/server/infra/errors";

const UTF8_DECODER = new TextDecoder();
const CONTENT_LENGTH_DIGITS_RE = /^\d+$/;

export async function fetchBodyText(
  url: string,
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  const contentLength = res.headers.get("content-length")?.trim();
  if (contentLength && CONTENT_LENGTH_DIGITS_RE.test(contentLength) && Number(contentLength) > maxBytes) {
    void res.body?.cancel()?.catch(() => {});
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
  const { text, bytes } = await readBodyText(res, url, maxBytes, signal);
  if (bytes > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
  return text;
}

export interface JsonResponse<T> {
  status: number;
  body: T;
}

export async function parseJsonBody<T>(url: string, res: Response, maxBytes: number, signal: AbortSignal): Promise<T> {
  const body = await fetchBodyText(url, res, maxBytes, signal);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
  }
}

async function readBodyText(
  res: Response,
  url: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; bytes: number }> {
  const body = res.body;
  if (!body) {
    try {
      const text = await res.text();
      return { text, bytes: utf8ByteLength(text) };
    } catch (e) {
      throw new UpstreamError(
        `Upstream body read failed for ${url}: ${errMsg(e)}`,
        signal.aborted ? { timeout: true } : { retryable: true },
      );
    }
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new UpstreamError(`Upstream payload too large for ${url}`);
        }
        chunks.push(value);
      }
    }
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    await reader.cancel().catch(() => {});
    throw new UpstreamError(
      `Upstream body read failed for ${url}: ${errMsg(e)}`,
      signal.aborted ? { timeout: true } : { retryable: true },
    );
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { text: UTF8_DECODER.decode(merged), bytes: total };
}
