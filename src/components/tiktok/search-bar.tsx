"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useView } from "@/lib/tiktok/store";
import { useState, useEffect } from "react";

export function SearchBar() {
  const { searchQuery, setSearch, setTab, t, activeTab } = useView();
  const [local, setLocal] = useState(searchQuery);

  const [previousQuery, setPreviousQuery] = useState(searchQuery);
  if (previousQuery !== searchQuery) {
    setPreviousQuery(searchQuery);
    setLocal(searchQuery);
  }

  useEffect(() => {
    if (activeTab !== "search") return;
    const timer = setTimeout(() => {
      if (local.trim() !== useView.getState().searchQuery) setSearch(local.trim());
    }, 450);
    return () => clearTimeout(timer);
  }, [local, setSearch, activeTab]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = local.trim();
    if (!q) return;
    setSearch(q);
  }

  return (
    <form onSubmit={submit} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        maxLength={200}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="h-10 rounded-full border-border/60 bg-muted/60 pl-9 pr-9 placeholder:text-muted-foreground focus-visible:bg-background"
        onFocus={() => {
          if (useView.getState().activeTab !== "search") setTab("search");
        }}
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            setSearch("");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}
