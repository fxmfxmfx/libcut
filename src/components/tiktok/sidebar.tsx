"use client";

import { Rss, Users, Heart, Search, Settings, ShieldOff } from "lucide-react";
import { useView, type Tab } from "@/lib/tiktok/store";
import { cn } from "@/lib/utils";

const items: { id: Tab; labelKey: string; icon: typeof Rss }[] = [
  { id: "feed", labelKey: "nav.feed", icon: Rss },
  { id: "subscriptions", labelKey: "nav.subscriptions", icon: Users },
  { id: "favorites", labelKey: "nav.favorites", icon: Heart },
  { id: "search", labelKey: "nav.search", icon: Search },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

export function Sidebar() {
  const { activeTab, setTab, selectedAuthor, t } = useView();
  const effective = selectedAuthor ? null : activeTab;

  return (
    <>
      {/* Desktop vertical sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:shrink-0 md:border-r md:border-border/60 md:bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <ShieldOff className="size-6 text-primary" />
          <span className="text-base font-bold tracking-tight">libcut</span>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {items.map((it) => {
            const Icon = it.icon;
            const active = effective === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setTab(it.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {t(it.labelKey)}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
        {items.map((it) => {
          const Icon = it.icon;
          const active = effective === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {t(it.labelKey)}
            </button>
          );
        })}
      </nav>
    </>
  );
}
