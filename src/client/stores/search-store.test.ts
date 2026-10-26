import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSearchStore } from "./search-store";

const MAX_ROUTES = 32;

describe("useSearchStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("remembers a term per route", () => {
    const store = useSearchStore();
    store.setTerm("/models", "claude opus 5.5");
    store.setTerm("/news", "deepseek v4");
    expect(store.terms).toEqual({ "/models": "claude opus 5.5", "/news": "deepseek v4" });
  });

  it("caps the record so it cannot grow without bound", () => {
    const store = useSearchStore();
    for (let i = 0; i < MAX_ROUTES + 5; i++) store.setTerm(`/r${i}`, `t${i}`);
    expect(Object.keys(store.terms)).toHaveLength(MAX_ROUTES);
    expect(store.terms["/r0"]).toBeUndefined();
    expect(store.terms[`/r${MAX_ROUTES + 4}`]).toBe(`t${MAX_ROUTES + 4}`);
  });

  it("evicts the least recently used route, not the earliest inserted", () => {
    const store = useSearchStore();
    for (let i = 0; i < MAX_ROUTES; i++) store.setTerm(`/r${i}`, `t${i}`);

    store.setTerm("/r0", "again");
    store.setTerm("/new", "fresh");

    expect(store.terms["/r0"]).toBe("again");
    expect(store.terms["/r1"]).toBeUndefined();
    expect(Object.keys(store.terms)).toHaveLength(MAX_ROUTES);
  });
});
