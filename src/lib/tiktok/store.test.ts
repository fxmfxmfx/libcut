import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLocalStorageError, getUnreadablePreferencesRaw, isSafeCustomCss, reportLocalStorageError, restorePreferences, useView } from "./store";

const scratch = mkdtempSync(join(tmpdir(), "libcut-preference-storage-"));
let failReads = false;
let writes = 0;

function storagePath(key: string) {
  return join(scratch, encodeURIComponent(key));
}

const localStorageMock = {
  getItem(key: string) {
    if (failReads) throw new Error("blocked storage");
    try {
      return readFileSync(storagePath(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  setItem(key: string, value: string) {
    writes++;
    writeFileSync(storagePath(key), value, "utf8");
  },
  removeItem(key: string) {
    try {
      rmSync(storagePath(key));
    } catch {
      // Missing keys match localStorage behavior.
    }
  },
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: localStorageMock, dispatchEvent: () => true },
});

function resetPreferences() {
  failReads = false;
  writes = 0;
  for (const key of ["libcut-preferences-v1", "libcut.lang", "libcut.theme", "libcut.accent", "libcut.css", "libcut.autoMarkSeen"]) {
    localStorageMock.removeItem(key);
  }
  useView.setState({
    lang: "en",
    theme: "default",
    accent: "#fe2c55",
    customCss: "",
    autoMarkSeen: true,
    preferencesReady: false,
  });
}

describe("view preference persistence", () => {
  beforeEach(resetPreferences);
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("migrates legacy preference keys without deleting them", () => {
    writeFileSync(storagePath("libcut.lang"), "ru", "utf8");
    writeFileSync(storagePath("libcut.theme"), "nord", "utf8");
    writeFileSync(storagePath("libcut.accent"), "#abc123", "utf8");
    writeFileSync(storagePath("libcut.css"), "body { color: red; }", "utf8");
    writeFileSync(storagePath("libcut.autoMarkSeen"), "false", "utf8");

    useView.getState().hydratePreferences();

    expect(useView.getState().lang).toBe("en");
    expect(useView.getState().theme).toBe("nord");
    expect(useView.getState().accent).toBe("#abc123");
    expect(useView.getState().customCss).toBe("body { color: red; }");
    expect(useView.getState().autoMarkSeen).toBe(false);
    expect(localStorageMock.getItem("libcut.lang")).toBe("ru");
    expect(JSON.parse(localStorageMock.getItem("libcut-preferences-v1")!).autoMarkSeen).toBe(false);
  });

  it("persists and rehydrates autoMarkSeen with the other client preferences", () => {
    useView.getState().hydratePreferences();
    useView.getState().setTheme("dracula");
    useView.getState().setAccent("#123456");
    useView.getState().setCustomCss(".test { color: blue; }");
    useView.getState().setAutoMarkSeen(false);

    useView.setState({ preferencesReady: false, lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: true });
    useView.getState().hydratePreferences();

    expect(useView.getState().lang).toBe("en");
    expect(useView.getState().theme).toBe("dracula");
    expect(useView.getState().accent).toBe("#123456");
    expect(useView.getState().customCss).toBe(".test { color: blue; }");
    expect(useView.getState().autoMarkSeen).toBe(false);
  });

  it("force-hydrates external preference edits and removals", () => {
    useView.getState().hydratePreferences();
    const external = { lang: "ru", theme: "nord", accent: "#123abc", customCss: ".external { color: blue; }", autoMarkSeen: false };
    writeFileSync(storagePath("libcut-preferences-v1"), JSON.stringify(external), "utf8");

    useView.getState().hydratePreferences(true);

    expect(useView.getState().lang).toBe("en");
    expect(useView.getState().theme).toBe("nord");
    expect(useView.getState().autoMarkSeen).toBe(false);
    localStorageMock.removeItem("libcut-preferences-v1");
    useView.getState().hydratePreferences(true);

    expect(useView.getState().lang).toBe("en");
    expect(useView.getState().theme).toBe("default");
    expect(useView.getState().autoMarkSeen).toBe(true);
    expect(localStorageMock.getItem("libcut-preferences-v1")).toBeNull();
  });

  it("does not read localStorage during server rendering", () => {
    const originalWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");
    expect(() => useView.getState().hydratePreferences()).not.toThrow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });

  it("rejects unsafe preference values before they reach the document", () => {
    useView.getState().hydratePreferences();
    useView.getState().setAccent("red");
    useView.getState().setTheme("data:text/html");
    useView.getState().setCustomCss("@import url(https://bad.test/a.css);");

    expect(useView.getState().accent).toBe("#fe2c55");
    expect(useView.getState().theme).toBe("default");
    expect(useView.getState().customCss).toBe("");
    expect(isSafeCustomCss(".card { color: red; }")).toBe(true);
    expect(isSafeCustomCss("a { background: url(https://bad.test/x); }")).toBe(false);
  });

  it("preserves and exposes unsafe stored preferences without applying them", () => {
    const damaged = JSON.stringify({ lang: "en", theme: "data:text/html", accent: "red", customCss: "@import url(https://bad.test/a.css);", autoMarkSeen: true });
    writeFileSync(storagePath("libcut-preferences-v1"), damaged, "utf8");

    useView.getState().hydratePreferences();

    expect(useView.getState().theme).toBe("default");
    expect(useView.getState().accent).toBe("#fe2c55");
    expect(useView.getState().customCss).toBe("");
    expect(getUnreadablePreferencesRaw()).toBe(damaged);
    expect(getLocalStorageError("preferences")).toContain("damaged or unsafe");

    restorePreferences({ lang: "en", theme: "default", accent: "#fe2c55", customCss: "", autoMarkSeen: true });
  });

  it("reports blocked storage and does not overwrite data it cannot read", () => {
    writeFileSync(storagePath("libcut-preferences-v1"), "preserve this value", "utf8");
    failReads = true;
    useView.getState().hydratePreferences();
    const beforeWrites = writes;

    useView.getState().setTheme("nord");

    expect(getLocalStorageError("preferences")).toContain("Existing values were preserved");
    expect(writes).toBe(beforeWrites);
    expect(readFileSync(storagePath("libcut-preferences-v1"), "utf8")).toBe("preserve this value");
    reportLocalStorageError("clientData", null);
    expect(getLocalStorageError()).toContain("Existing values were preserved");
  });
});
