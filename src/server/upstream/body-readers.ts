import { utf8ByteLength } from "@/server/util/hash";
import { UpstreamError, errMsg } from "@/server/api/errors";

const CONTENT_LENGTH_DIGITS_RE = /^\d+$/;

function readAbortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Body read aborted");
}

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
  const parts: string[] = [];
  const decoder = new TextDecoder();
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw readAbortError(signal);
      const readPromise = reader.read();
      const { done, value } = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
        const onAbort = (): void => reject(readAbortError(signal));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        readPromise.then(
          (r) => {
            signal.removeEventListener("abort", onAbort);
            resolve(r);
          },
          (e) => {
            signal.removeEventListener("abort", onAbort);
            reject(e);
          },
        );
      });
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new UpstreamError(`Upstream payload too large for ${url}`);
        }
        parts.push(decoder.decode(value, { stream: true }));
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
    try {
      reader.releaseLock();
    } catch {}
  }
  parts.push(decoder.decode());
  return { text: parts.join(""), bytes: total };
}
