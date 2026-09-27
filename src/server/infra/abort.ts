function abortError(): Error {
  return new Error("Aborted");
}

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
      } catch {}
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

export async function runAbortable<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task();
  if (signal.aborted) throw abortError();
  const work = Promise.resolve().then((): Promise<T> => {
    if (signal.aborted) return Promise.reject(abortError());
    return task();
  });
  return raceAbort(work, signal, abortError);
}
