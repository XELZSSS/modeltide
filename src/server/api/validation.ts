import { MAX_ID_CHARS } from "@/shared/config";
import { ValidationError } from "./errors";

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
type QuerySpec = EnumSpec | StringSpec;
export type QuerySchema = Record<string, QuerySpec>;

export const qEnum = <const V extends string>(values: readonly V[], d?: V): EnumSpec<V> => ({
  type: "enum",
  values,
  ...(d === undefined ? {} : { default: d }),
});
export const qStr = (o: { default?: string; maxLength?: number } = {}): StringSpec => ({
  type: "string",
  ...o,
});

type SpecValue<S extends QuerySpec> = S extends EnumSpec<infer V> ? V : string;
export type ValidatedQuery<S extends QuerySchema> = { [K in keyof S]: SpecValue<S[K]> };

function parseSingle(name: string, v: string, spec: QuerySpec): string {
  if (v.length > MAX_ID_CHARS) throw new ValidationError(`Query param "${name}" is too long`);
  if (spec.type === "string") {
    if (spec.maxLength != null && v.length > spec.maxLength) {
      throw new ValidationError(`Query param "${name}" must be <= ${spec.maxLength} chars`);
    }
    return v;
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
