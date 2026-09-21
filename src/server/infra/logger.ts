import type { AppContext } from "@/server/context";

export type LogLevel = "info" | "warn" | "error";

export function createLogger(): AppContext["log"] {
  return (level, msg, meta) => {
    const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
}
