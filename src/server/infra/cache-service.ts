// Barrel preserving `@/server/infra/cache-service` imports.
export { maxStaleMs, isEnvelope, type StaleEnvelope } from "./cache/envelope";
export { MemoryL1, type MemoryEntry } from "./cache/memory-l1";
export { InflightRegistry } from "./cache/inflight";
export { CacheService, resetModuleCachesForTests, type CacheStores } from "./cache/service";
