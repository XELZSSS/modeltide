import { createSharedRef } from "@/client/utils/shared-ref";

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

export const useDevice = createSharedRef(currentMobile, (notify) => {
  const m = mobileMedia();
  if (!m) return () => {};
  // Attach lazily on first subscriber; detach when no explicit teardown needed
  // (MediaQueryList lives for page lifetime, single listener is cheap).
  m.addEventListener("change", notify);
  return () => m.removeEventListener("change", notify);
});
