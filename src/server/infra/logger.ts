type LogLevel = "info" | "warn" | "error";

export type Logger = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => void;

const LEVEL_RANK: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

/** The one threshold every writer honors. */
const MIN_LEVEL: LogLevel = "info";

function write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Sink for call sites with no AppContext; same threshold and format as createLogger(). */
export const logger: Logger = write;

export function createLogger(): Logger {
  return write;
}
