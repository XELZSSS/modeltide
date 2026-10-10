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

const mobile = ref(currentMobile());
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  mobileMedia()?.addEventListener("change", () => {
    mobile.value = currentMobile();
  });
}

export function useDevice(): Ref<boolean> {
  ensureSubscribed();
  return mobile;
}
