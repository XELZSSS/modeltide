export function registerServiceWorker(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  if (process.env.NODE_ENV !== "production") return;
  const register = (): void => {
    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function unregisterStaleServiceWorker(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV === "production") return;
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.allSettled(regs.map((reg) => reg.unregister())))
    .catch((err) => {
      console.warn("[pwa] service worker unregister failed:", err);
    });
}
