import { ValidationError } from "@/server/infra/errors";

interface NumberSpec {
  type: "number";
  default?: string;
  min?: number;
  max?: number;
  integer?: boolean;
}
interface EnumSpec<V extends string = string> {
  type: "enum";
  values: readonly V[];
  default?: V;
}
interface StringSpec {
  type: "string";
  default?: string;
  maxLength?: number;
}
type QuerySpec = NumberSpec | EnumSpec | StringSpec;
export type QuerySchema = Record<string, QuerySpec>;

export const qEnum = <const V extends string>(values: readonly V[], d?: V): EnumSpec<V> => ({
  type: "enum",
  values,
  ...(d === undefined ? {} : { default: d }),
});
export const qNum = (o: { default?: string; min?: number; max?: number; integer?: boolean } = {}): NumberSpec => ({
  type: "number",
  ...o,
});
export const qStr = (o: { default?: string; maxLength?: number } = {}): StringSpec => ({
  type: "string",
  ...o,
});

type SpecValue<S extends QuerySpec> = S extends EnumSpec<infer V> ? V : S extends NumberSpec ? number : string;
export type ValidatedQuery<S extends QuerySchema> = { [K in keyof S]: SpecValue<S[K]> };

export function validateQuery<S extends QuerySchema>(
  raw: Record<string, string | string[]>,
  schema: S,
): ValidatedQuery<S> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const rawVal = raw[name];
    const rawStr = Array.isArray(rawVal) ? (rawVal[0] ?? "") : (rawVal ?? "");
    let v: string | undefined = rawStr.trim();
    if (!v) v = spec.default;
    if (v === undefined) continue;
    if (v.length > 500) throw new ValidationError(`Query param "${name}" is too long`);
    if (spec.type === "string") {
      if (spec.maxLength != null && v.length > spec.maxLength) {
        throw new ValidationError(`Query param "${name}" must be <= ${spec.maxLength} chars`);
      }
      out[name] = v;
    } else if (spec.type === "number") {
      if (!/^[+-]?(\d+(\.\d+)?)$/.test(v)) {
        throw new ValidationError(`Query param "${name}" must be a number`);
      }
      if (spec.integer && /[.eE]/.test(v)) {
        throw new ValidationError(`Query param "${name}" must be an integer`);
      }
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ValidationError(`Query param "${name}" must be a number`);
      if (spec.integer && !Number.isInteger(n)) throw new ValidationError(`Query param "${name}" must be an integer`);
      if (spec.min != null && n < spec.min) throw new ValidationError(`Query param "${name}" must be >= ${spec.min}`);
      if (spec.max != null && n > spec.max) throw new ValidationError(`Query param "${name}" must be <= ${spec.max}`);
      out[name] = n;
    } else if (!(spec.values as readonly string[]).includes(v)) {
      throw new ValidationError(`Query param "${name}" must be one of: ${spec.values.join(", ")}`);
    } else out[name] = v;
  }
  return out as ValidatedQuery<S>;
}
