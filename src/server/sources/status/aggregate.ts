export interface SourceAggregate {
  ok: boolean;
  warn: boolean;
  warnReason: string | null;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}
