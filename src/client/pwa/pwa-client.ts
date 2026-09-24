const SW_URL = "/sw.js";

const SKIP_WAITING = { type: "SKIP_WAITING" };

let reloading = false;

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function adoptUpdates(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage(SKIP_WAITING);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        installing.postMessage(SKIP_WAITING);
      }
    });
  });
}

function register(): void {
  void navigator.serviceWorker
    .register(SW_URL)
    .then(adoptUpdates)
    .catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  if (!import.meta.env.PROD) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
  }
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function unregisterStaleServiceWorker(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.PROD) return;
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.allSettled(regs.map((reg) => reg.unregister())))
    .catch((err) => {
      console.warn("[pwa] service worker unregister failed:", err);
    });
}
