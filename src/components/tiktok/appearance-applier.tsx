"use client";

import { useEffect } from "react";
import { useView } from "@/lib/tiktok/store";

/**
 * Applies the user's appearance settings (theme, accent color, custom CSS) to
 * the document. Mounted once in the root layout.
 */
export function AppearanceApplier() {
  const theme = useView((s) => s.theme);
  const accent = useView((s) => s.accent);
  const customCss = useView((s) => s.customCss);

  // Theme via data-theme attribute.
  useEffect(() => {
    const el = document.documentElement;
    if (theme && theme !== "default") {
      el.setAttribute("data-theme", theme);
    } else {
      el.removeAttribute("data-theme");
    }
    // Light theme should drop the `dark` class so dark-only selectors don't win.
    if (theme === "light") {
      el.classList.remove("dark");
    } else {
      el.classList.add("dark");
    }
  }, [theme]);

  // Accent color overrides --primary (and --ring) via a runtime <style>.
  useEffect(() => {
    let el = document.getElementById("libcut-accent") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "libcut-accent";
      document.head.appendChild(el);
    }
    el.textContent = `:root{--primary:${accent};--ring:${accent};--sidebar-primary:${accent};--sidebar-ring:${accent};}`;
  }, [accent]);

  // Custom CSS injected as a <style> tag.
  useEffect(() => {
    let el = document.getElementById("libcut-custom-css") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "libcut-custom-css";
      document.head.appendChild(el);
    }
    el.textContent = customCss || "";
  }, [customCss]);

  return null;
}
