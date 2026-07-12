"use client";

import { ShieldOff } from "lucide-react";
import { SearchBar } from "./search-bar";
import { StatusBadge } from "./status-badge";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <ShieldOff className="size-5 text-primary" />
          <span className="text-sm font-bold">libcut</span>
        </div>

        <div className="flex flex-1 justify-center">
          <SearchBar />
        </div>

        <div className="hidden sm:block">
          <StatusBadge />
        </div>
      </div>
    </header>
  );
}
