"use client";

export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  return ua.includes("macintosh") && maxTouchPoints > 1;
}

interface StandaloneFlags {
  navigatorStandalone?: unknown;
  displayStandalone?: boolean;
  displayFullscreen?: boolean;
}

export function isStandaloneMode(flags: StandaloneFlags): boolean {
  if (flags.navigatorStandalone === true) return true;
  return flags.displayStandalone === true || flags.displayFullscreen === true;
}

export function useOnlineStatus(): boolean {
  return true;
}

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export function usePwaInstall(): {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  promptInstall: () => Promise<InstallOutcome>;
} {
  return {
    canInstall: false,
    isInstalled: false,
    isIos: false,
    promptInstall: async () => "unavailable" as InstallOutcome,
  };
}

export function useSwUpdate(): { updateAvailable: boolean; applyUpdate: () => void } {
  return { updateAvailable: false, applyUpdate: () => window.location.reload() };
}

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
