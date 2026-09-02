import type { Env } from "@/server/context";
import type { AppContext } from "@/server/context";
import type { TFunction } from "@/shared/i18n";

/**
 * Creates a mock Env object for testing.
 * Only includes the minimum required bindings; extend as needed.
 */
export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    CACHE: {
      get: async () => null,
      put: async () => {},
      delete: async () => false,
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null }),
    } as unknown as KVNamespace,
    ...overrides,
  };
}

/**
 * Creates a mock AppContext for testing.
 * Includes a mock KV, HTTP client, and logger.
 */
export function createMockContext(overrides?: Partial<AppContext>): AppContext {
  return {
    cache: {} as AppContext["cache"],
    http: {
      json: async () => ({}),
      text: async () => "",
      probe: async () => ({ ok: true, status: 200, latencyMs: 100, error: null }),
    } as unknown as AppContext["http"],
    kv: {
      get: async () => null,
      put: async () => {},
    } as unknown as AppContext["kv"],
    log: () => {},
    ...overrides,
  };
}

/**
 * Creates a mock TFunction for testing.
 * Returns the key itself, optionally with interpolated params.
 */
export function createMockT(overrides?: Record<string, string>): TFunction {
  return ((key: string, params?: Record<string, string | number>): string => {
    if (overrides?.[key]) return overrides[key]!;
    if (params) {
      return Object.entries(params).reduce(
        (result, [k, v]) => result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
        key,
      );
    }
    return key;
  }) as TFunction;
}
