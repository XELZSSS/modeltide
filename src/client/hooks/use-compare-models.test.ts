import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { aaModel } from "@/test/fixtures";
import { useCompareStore } from "@/client/stores/compare-store";
import { usePruneCompareIds } from "./use-compare-models";

const catalogue = (...ids: string[]) => ref(ids.map((id) => aaModel({ id, slug: id })));

describe("usePruneCompareIds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("leaves the selection alone while the catalogue is still empty", () => {
    const store = useCompareStore();
    store.compareIds = ["a", "b"];
    const onPruned = vi.fn();

    usePruneCompareIds(catalogue(), onPruned);

    expect(store.compareIds).toEqual(["a", "b"]);
    expect(onPruned).not.toHaveBeenCalled();
  });

  it("drops ids the loaded catalogue no longer contains", () => {
    const store = useCompareStore();
    store.compareIds = ["a", "gone"];
    const onPruned = vi.fn();

    usePruneCompareIds(catalogue("a", "b"), onPruned);

    expect(store.compareIds).toEqual(["a"]);
    expect(onPruned).toHaveBeenCalledWith(["gone"]);
  });

  it("stays quiet when every id is still valid", () => {
    const store = useCompareStore();
    store.compareIds = ["a"];
    const onPruned = vi.fn();

    usePruneCompareIds(catalogue("a", "b"), onPruned);

    expect(store.compareIds).toEqual(["a"]);
    expect(onPruned).not.toHaveBeenCalled();
  });
});
