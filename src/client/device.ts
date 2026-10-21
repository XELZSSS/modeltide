import { ref, type Ref } from "vue";

// Tailwind's `md` breakpoint is 768px, so the JS mobile query must stop one pixel below it.
const MOBILE_MAX_WIDTH_PX = 767;
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;

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
