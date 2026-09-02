export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function isBeforeInstallPromptEvent(event: Event): event is BeforeInstallPromptEvent {
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
