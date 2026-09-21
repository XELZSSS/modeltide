import { describe, expect, it } from "vitest";
import { SOURCES } from "@/server/sources/registry";
import { validateQuery, type QuerySchema } from "@/server/infra/query-validation";
import { ValidationError } from "@/server/infra/errors";
import { MAX_MODEL_LIMIT, apiPaths } from "@/shared/config";

const pathsOf = () => SOURCES.map((s) => s.path);

function schemaOf(path: string): QuerySchema {
  const entry = SOURCES.find((s) => s.path === path);
  expect(entry, `${path} is not registered`).toBeDefined();
  return entry?.query ?? {};
}

describe("SOURCES manifest", () => {
  it("registers exactly one route per shared api path", () => {
    expect([...pathsOf()].sort()).toEqual(Object.values(apiPaths).sort());
    expect(new Set(pathsOf()).size).toBe(pathsOf().length);
  });

  it("answers a bare request with defaults for every route except the single-model lookup", () => {
    const required = pathsOf().filter((path) => {
      try {
        validateQuery({}, schemaOf(path));
        return false;
      } catch (err) {
        expect(err, path).toBeInstanceOf(ValidationError);
        return true;
      }
    });
    expect(required).toEqual([apiPaths.openSourceModel]);
  });

  it("warms with typed params that satisfy their own schema", () => {
    const warmed = SOURCES.filter((s) => s.warmParams?.length);
    expect(warmed.length).toBeGreaterThan(0);
    for (const source of warmed) {
      const schema = source.query ?? {};
      for (const params of source.warmParams ?? []) {
        for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
          const spec = schema[name];
          expect(spec, `${source.path} warms unknown param "${name}"`).toBeDefined();
          if (spec?.type === "enum") expect(spec.values, `${source.path}.${name}`).toContain(value as string);
          if (spec?.type === "number") {
            expect(typeof value).toBe("number");
            expect(value as number).toBeGreaterThanOrEqual(spec.min ?? -Infinity);
            expect(value as number).toBeLessThanOrEqual(spec.max ?? Infinity);
          }
        }
      }
    }
  });

  it("clamps the open-source limit to the shared ceiling", () => {
    const schema = schemaOf(apiPaths.openSourceModels);
    expect(schema.limit).toMatchObject({ type: "number", max: MAX_MODEL_LIMIT, integer: true, default: "200" });
    expect(() => validateQuery({ limit: "999999" }, schema)).toThrowError(/must be <= 500/);
    expect(validateQuery({ limit: "50" }, schema).limit).toBe(50);
  });

  it("overrides response cache headers only on the fast-changing status route", () => {
    const overrides = SOURCES.filter((s) => s.cache).map((s) => s.path);
    expect(overrides).toEqual([apiPaths.statusHistory]);
    expect(SOURCES.find((s) => s.path === apiPaths.statusHistory)?.cache).toEqual({
      browser: "public, max-age=15",
      cdn: "public, max-age=30, stale-while-revalidate=30",
    });
  });

  it("warms every news category so no first visitor pays for a cold feed", () => {
    const news = SOURCES.find((s) => s.path === apiPaths.news);
    const categories = (news?.warmParams ?? []) as { category: string }[];
    expect(news?.warm).toBe("core");
    expect(categories.map((c) => c.category)).toEqual(["industry", "opensource", "hardware", "funding", "research"]);
  });
});
