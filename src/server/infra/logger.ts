type LogLevel = "info" | "warn" | "error";

export type Logger = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => void;

function write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger: Logger = write;

export function logPartial(
  log: Logger,
  source: string,
  fields: Record<string, number | boolean | string>,
): void {
  log("warn", `[${source}] partial`, fields);
}
