import { describe, expect, it } from "vitest";
import { isIosDevice, isStandaloneMode } from "@/client/pwa/install";

describe("isIosDevice", () => {
  it("detects iPhone and iPad user agents", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe(true);
  });
  it("detects iPadOS 13+ masquerading as Macintosh with touch", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5)).toBe(true);
  });
  it("rejects desktop Macs without touch and Android devices", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});

describe("isStandaloneMode", () => {
  it("is true for iOS standalone or any display-mode match", () => {
    expect(isStandaloneMode({ navigatorStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayStandalone: true })).toBe(true);
    expect(isStandaloneMode({ displayFullscreen: true })).toBe(true);
  });
  it("is false for regular browser tabs", () => {
    expect(isStandaloneMode({})).toBe(false);
    expect(isStandaloneMode({ navigatorStandalone: false, displayStandalone: false, displayFullscreen: false })).toBe(
      false,
    );
  });
});
