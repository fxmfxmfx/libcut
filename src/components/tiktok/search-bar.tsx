"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useView } from "@/lib/tiktok/store";
import { useState, useEffect } from "react";

export function SearchBar() {
  const { searchQuery, setSearch, setTab, t } = useView();
  const [local, setLocal] = useState(searchQuery);

  useEffect(() => {
    setLocal(searchQuery);
  }, [searchQuery]);

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
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Очистить"
        >
          <X className="size-4" />
        </button>
      )}
    </form>
  );
}
