import { ref, type Ref } from "vue";

const MOBILE_QUERY = "(max-width: 767px)";

let media: MediaQueryList | null | undefined;

function mobileMedia(): MediaQueryList | null {
  if (media === undefined) {
    media = typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY) : null;
  }
  return media;
}

function currentMobile(): boolean {
  return mobileMedia()?.matches ?? false;
}

function singletonRef<T>(current: () => T, subscribe: (update: (v: T) => void) => void): () => Ref<T> {
  const value = ref(current()) as Ref<T>;
  let subscribed = false;
  return () => {
    if (!subscribed) {
      subscribed = true;
      subscribe((v) => {
        value.value = v;
      });
    }
    return value;
  };
}

export const useDevice = singletonRef(currentMobile, (update) => {
  mobileMedia()?.addEventListener("change", () => update(currentMobile()));
});
