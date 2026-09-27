import { onScopeDispose, ref, type Ref } from "vue";

const MOBILE_QUERY = "(max-width: 767px)";

let media: MediaQueryList | null | undefined;
const listeners = new Set<(isMobile: boolean) => void>();

function mobileMedia(): MediaQueryList | null {
  if (media === undefined) {
    media = typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY) : null;
  }
  return media;
}

function currentMobile(): boolean {
  return mobileMedia()?.matches ?? false;
}

function notify(): void {
  const isMobile = currentMobile();
  for (const listener of listeners) listener(isMobile);
}

export function useDevice(): Ref<boolean> {
  const isMobile = ref(currentMobile());
  if (listeners.size === 0) mobileMedia()?.addEventListener("change", notify);
  const listener = (next: boolean) => {
    isMobile.value = next;
  };
  listeners.add(listener);
  onScopeDispose(() => {
    listeners.delete(listener);
    if (listeners.size === 0) mobileMedia()?.removeEventListener("change", notify);
  });
  return isMobile;
}
