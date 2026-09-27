const SW_URL = "/sw.js";

const SKIP_WAITING = { type: "SKIP_WAITING" };

let reloading = false;
let waitingWorker: ServiceWorker | null = null;

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function adoptWhenIdle(worker: ServiceWorker): void {
  waitingWorker = worker;
  if (document.visibilityState === "hidden") {
    waitingWorker = null;
    worker.postMessage(SKIP_WAITING);
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState !== "hidden" || !waitingWorker) return;
  const worker = waitingWorker;
  waitingWorker = null;
  worker.postMessage(SKIP_WAITING);
}

function adoptUpdates(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (waiting && navigator.serviceWorker.controller) adoptWhenIdle(waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) adoptWhenIdle(installing);
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
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  if (!import.meta.env.PROD) return;
  if (navigator.serviceWorker.controller) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
  }
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function unregisterStaleServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.PROD) return;
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.allSettled(regs.map((reg) => reg.unregister())))
    .catch((err) => {
      console.warn("[pwa] service worker unregister failed:", err);
    });
}
