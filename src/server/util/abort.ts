import { errMsg } from "@/server/api/errors";
import { logger } from "@/server/api/logger";

export function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
  /** Rejects with exactly what this returns — an abort reason is often a `DOMException` whose name classifies it. */
  makeError: () => unknown,
  onAbort?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handleAbort = (): void => {
      try {
        onAbort?.();
      } catch (err) {
        logger("warn", `[abort] onAbort callback failed: ${errMsg(err)}`);
      }
      reject(makeError());
    };
    // A listener added to an already-aborted signal never fires, so that case has to be answered here or this promise
    // would hang. `work` still gets a rejection handler so the abandoned request cannot surface as an unhandled one.
    if (signal.aborted) {
      work.then(undefined, () => {});
      reject(makeError());
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(err);
      },
    );
  });
}
