import { singletonRef } from "@/client/utils/singleton-ref";

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

export const useDevice = singletonRef(currentMobile, (update) => {
  mobileMedia()?.addEventListener("change", () => update(currentMobile()));
});
