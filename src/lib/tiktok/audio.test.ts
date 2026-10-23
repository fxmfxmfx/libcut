import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { audioStorageKey, useAudio } from "./audio";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let stored: string | null = null;

beforeEach(() => {
  stored = null;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
    },
    dispatchEvent: () => true,
  } });
  useAudio.setState({ ready: false, volume: 1, muted: false, normalizeAudio: false });
});
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("audio preferences", () => {
  test("disables normalization for new and legacy volume preferences", () => {
    useAudio.getState().hydrate();
    expect(useAudio.getState().normalizeAudio).toBe(false);
    stored = JSON.stringify({ volume: 0.35, muted: false });
    useAudio.getState().hydrate(true);
    expect(useAudio.getState().volume).toBe(0.35);
    expect(useAudio.getState().normalizeAudio).toBe(false);
  });

  test("keeps normalization, volume, and mute across reload and volume changes", () => {
    useAudio.getState().setNormalizeAudio(true);
    useAudio.getState().setVolume(0.4);
    useAudio.getState().toggleMute();
    expect(JSON.parse(stored!)).toEqual({ volume: 0.4, muted: true, normalizeAudio: true, normalizationVersion: 2 });
    useAudio.setState({ volume: 1, muted: false, normalizeAudio: false });
    useAudio.getState().hydrate(true);
    expect(useAudio.getState().volume).toBe(0.4);
    expect(useAudio.getState().muted).toBe(true);
    expect(useAudio.getState().normalizeAudio).toBe(true);
    expect(audioStorageKey).toBe("libcut-audio-v1");
  });

  test("turns off the old implicit enabled value without changing volume or mute", () => {
    stored = JSON.stringify({ volume: 0.6, muted: true, normalizeAudio: true });
    useAudio.getState().hydrate();
    expect(useAudio.getState().normalizeAudio).toBe(false);
    expect(useAudio.getState().volume).toBe(0.6);
    expect(useAudio.getState().muted).toBe(true);
  });

  test("preserves malformed saved values without applying them", () => {
    stored = JSON.stringify({ volume: 0.2, muted: false, normalizeAudio: "yes" });
    const before = stored;
    useAudio.getState().hydrate();
    expect(stored).toBe(before);
    expect(useAudio.getState().volume).toBe(1);
    expect(useAudio.getState().normalizeAudio).toBe(false);
  });
});
