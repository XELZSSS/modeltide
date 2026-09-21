"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
  const candidate = event as Partial<BeforeInstallPromptEvent>;
  return typeof candidate.prompt === "function" && candidate.userChoice instanceof Promise;
}

export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  return ua.includes("macintosh") && maxTouchPoints > 1;
}

export interface StandaloneFlags {
  navigatorStandalone?: unknown;
  displayStandalone?: boolean;
  displayFullscreen?: boolean;
}

export function isStandaloneMode(flags: StandaloneFlags): boolean {
  if (flags.navigatorStandalone === true) return true;
  return flags.displayStandalone === true || flags.displayFullscreen === true;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  promptInstall: () => Promise<InstallOutcome>;
}

const DISPLAY_STANDALONE = "(display-mode: standalone)";
const DISPLAY_FULLSCREEN = "(display-mode: fullscreen)";

let displayQueries: { standalone: MediaQueryList; fullscreen: MediaQueryList } | null = null;

function getDisplayQueries(): { standalone: MediaQueryList; fullscreen: MediaQueryList } {
  displayQueries ??= {
    standalone: window.matchMedia(DISPLAY_STANDALONE),
    fullscreen: window.matchMedia(DISPLAY_FULLSCREEN),
  };
  return displayQueries;
}

function readStandalone(): boolean {
  const { standalone, fullscreen } = getDisplayQueries();
  return isStandaloneMode({
    navigatorStandalone: (navigator as Navigator & { standalone?: unknown }).standalone,
    displayStandalone: standalone.matches,
    displayFullscreen: fullscreen.matches,
  });
}

function subscribeStandalone(onChange: () => void): () => void {
  const { standalone, fullscreen } = getDisplayQueries();
  standalone.addEventListener("change", onChange);
  fullscreen.addEventListener("change", onChange);
  return () => {
    standalone.removeEventListener("change", onChange);
    fullscreen.removeEventListener("change", onChange);
  };
}

/**
 * Display-mode install state as an external store, like `useOnlineStatus` above.
 * A mount-time read in an effect both cascaded a render and missed any
 * display-mode change while the page stayed open.
 */
function useStandaloneDisplayMode(): boolean {
  return useSyncExternalStore(subscribeStandalone, readStandalone, () => false);
}

export function usePwaInstall(): PwaInstallState {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIos] = useState<boolean>(() =>
    typeof navigator === "undefined" ? false : isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
  );
  const [installedThisSession, setInstalledThisSession] = useState(false);
  const isInstalled = useStandaloneDisplayMode() || installedThisSession;

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (!isBeforeInstallPromptEvent(e)) return;
      deferredRef.current = e;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setCanInstall(false);
      setInstalledThisSession(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const evt = deferredRef.current;
    if (!evt) return "unavailable";
    await evt.prompt();
    const choice = await evt.userChoice;
    deferredRef.current = null;
    setCanInstall(false);
    if (choice.outcome === "accepted") setInstalledThisSession(true);
    return choice.outcome;
  }, []);

  return { canInstall: canInstall && !isInstalled, isInstalled, isIos, promptInstall };
}

export interface SwUpdateState {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

export function useSwUpdate(): SwUpdateState {
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    const onControllerChange = () => {
      if (reloadRef.current && !disposed) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    // getRegistration() is long-lived; remove these or they accumulate per mount.
    let onUpdateFound: (() => void) | undefined;
    let stateWorker: ServiceWorker | null = null;
    let onStateChange: (() => void) | undefined;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg || disposed) return;
        regRef.current = reg;
        if (reg.waiting) setUpdateAvailable(true);
        onUpdateFound = () => {
          const worker = reg.installing;
          if (!worker) return;
          stateWorker = worker;
          onStateChange = () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          };
          worker.addEventListener("statechange", onStateChange);
        };
        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch((err) => console.warn("[pwa] update check failed:", err));
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      const reg = regRef.current;
      if (reg && onUpdateFound) reg.removeEventListener("updatefound", onUpdateFound);
      if (stateWorker && onStateChange) stateWorker.removeEventListener("statechange", onStateChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const waiting = regRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    reloadRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return { updateAvailable, applyUpdate };
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
  // Idle boot can run after `load` already fired; gate on readyState.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/**
 * Dev safeguard: a production worker registered by an earlier `preview` run
 * keeps controlling this origin afterwards, so drop it outside production.
 */
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
