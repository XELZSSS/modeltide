import { ValidationError } from "./errors";

export interface NumberSpec {
  type: "number";
  default?: string;
  min?: number;
  max?: number;
}
export interface EnumSpec<V extends string = string> {
  type: "enum";
  values: readonly V[];
  default?: V;
}
export type QuerySpec = NumberSpec | EnumSpec;
export type QuerySchema = Record<string, QuerySpec>;

export const qEnum = <const V extends string>(values: readonly V[], d?: V): EnumSpec<V> => ({
  type: "enum",
  values,
  ...(d === undefined ? {} : { default: d }),
});
export const qNum = (o: { default?: string; min?: number; max?: number } = {}): NumberSpec => ({
  type: "number",
  ...o,
});

type SpecValue<S extends QuerySpec> = S extends EnumSpec<infer V> ? V : number;
export type ValidatedQuery<S extends QuerySchema> = { [K in keyof S]: SpecValue<S[K]> };

export function validateQuery<S extends QuerySchema>(raw: Record<string, string | string[]>, schema: S): ValidatedQuery<S> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    // Trim before the empty check so whitespace-only params ("%20") fall back to
    // the default instead of reaching Number("") === 0 below.
    const rawVal = raw[name];
    const rawStr = Array.isArray(rawVal) ? (rawVal[0] ?? "") : (rawVal ?? "");
    let v: string | undefined = rawStr.trim();
    if (!v) v = spec.default;
    if (v === undefined) continue;
    // Guard against oversized values (potential DoS).
    if (v.length > 500) throw new ValidationError(`Query param "${name}" is too long`);
    if (spec.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ValidationError(`Query param "${name}" must be a number`);
      if (spec.min != null && n < spec.min) throw new ValidationError(`Query param "${name}" must be >= ${spec.min}`);
      if (spec.max != null && n > spec.max) throw new ValidationError(`Query param "${name}" must be <= ${spec.max}`);
      out[name] = n;
    } else if (!(spec.values as readonly string[]).includes(v)) {
      throw new ValidationError(`Query param "${name}" must be one of: ${spec.values.join(", ")}`);
    } else out[name] = v;
  }
  return out as ValidatedQuery<S>;
}
