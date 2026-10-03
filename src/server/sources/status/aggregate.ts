export interface SourceAggregate {
  ok: boolean;
  warn: boolean;
  warnReason: string | null;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

interface AggregateInput {
  ok: boolean;
  degraded?: boolean;
  status: number | null;
  latencyMs: number | null;
  detail: string | null;
}

export function sourceAggregate(input: AggregateInput): SourceAggregate {
  const warn = input.ok && input.degraded === true;
  return {
    ok: input.ok,
    warn,
    warnReason: warn ? input.detail : null,
    status: input.status,
    latencyMs: input.latencyMs,
    error: input.ok ? null : input.detail,
  };
}
