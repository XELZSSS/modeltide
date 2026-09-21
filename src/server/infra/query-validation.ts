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

function parseSingle(name: string, v: string, spec: QuerySpec): string | number {
  if (v.length > 500) throw new ValidationError(`Query param "${name}" is too long`);
  if (spec.type === "string") {
    if (spec.maxLength != null && v.length > spec.maxLength) {
      throw new ValidationError(`Query param "${name}" must be <= ${spec.maxLength} chars`);
    }
    return v;
  }
  if (spec.type === "number") {
    // Single shape gate per kind: integers reject decimals/scientific/hex up
    // front ("1.0", "1e3", "0x10"), decimals accept plain fractions only.
    const re = spec.integer ? /^[+-]?\d+$/ : /^[+-]?(\d+(\.\d+)?)$/;
    if (!re.test(v)) {
      throw new ValidationError(
        spec.integer ? `Query param "${name}" must be an integer` : `Query param "${name}" must be a number`,
      );
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ValidationError(`Query param "${name}" must be a number`);
    if (spec.min != null && n < spec.min) throw new ValidationError(`Query param "${name}" must be >= ${spec.min}`);
    if (spec.max != null && n > spec.max) throw new ValidationError(`Query param "${name}" must be <= ${spec.max}`);
    return n;
  }
  if (!(spec.values as readonly string[]).includes(v)) {
    throw new ValidationError(`Query param "${name}" must be one of: ${spec.values.join(", ")}`);
  }
  return v;
}

export function validateQuery<S extends QuerySchema>(
  raw: Record<string, string | string[]>,
  schema: S,
): ValidatedQuery<S> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const rawVal = raw[name];
    if (rawVal === undefined) {
      if (spec.default === undefined) throw new ValidationError(`Query param "${name}" is required`);
      out[name] = parseSingle(name, spec.default, spec);
      continue;
    }
    if (Array.isArray(rawVal)) throw new ValidationError(`Query param "${name}" must not be repeated`);
    const v = rawVal.trim();
    if (!v) throw new ValidationError(`Query param "${name}" must not be empty`);
    out[name] = parseSingle(name, v, spec);
  }
  return out as ValidatedQuery<S>;
}
