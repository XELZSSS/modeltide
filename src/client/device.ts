import { ref, type Ref } from "vue";

const MOBILE_MAX_WIDTH_PX = 767;
const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;

// `window.matchMedia` is part of the browser baseline Vite builds for, and this module only ever loads in the app bundle,
// so the null branch it used to carry guarded a shape that cannot arrive.
let media: MediaQueryList | undefined;

function mobileMedia(): MediaQueryList {
  media ??= window.matchMedia(MOBILE_QUERY);
  return media;
}

function currentMobile(): boolean {
  return mobileMedia().matches;
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
  mobileMedia().addEventListener("change", () => update(currentMobile()));
});
