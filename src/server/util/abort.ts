import { errMsg } from "@/server/api/errors";
import { logger } from "@/server/api/logger";

export function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
  makeError: () => Error,
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
