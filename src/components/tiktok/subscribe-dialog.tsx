"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import { useSubscribe } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { useToast } from "@/hooks/use-toast";

/**
 * Subscribe dialog. Two modes:
 * - With `username` prop: subscribes directly to that user (no input prompt).
 *   Used in search results / author profile where the username is already known.
 * - Without `username` prop: shows an input for the user to type a handle.
 *   Used in the Subscriptions tab.
 */
export function SubscribeDialog({
  username,
  children,
}: {
  username?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [inputUsername, setInputUsername] = useState("");
  const subscribe = useSubscribe();
  const { openAuthor, t } = useView();
  const { toast } = useToast();

  const targetUsername = username ?? inputUsername.trim().replace(/^@/, "");
  const dataMode = useView((s) => s.dataMode);
  const clientSubscribe = useClientData((s) => s.subscribe);

  async function handleSubscribe() {
    const u = targetUsername.trim().replace(/^@/, "");
    if (!u) return;

    // Client mode: fetch profile via API (stateless), store in localStorage
    if (dataMode === "client") {
      try {
        const r = await fetch(`/api/tiktok/authors/${encodeURIComponent(u)}`);
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${r.status}`);
        }
        const d = await r.json();
        clientSubscribe({
          username: d.author.username,
          displayName: d.author.displayName,
          avatarUrl: d.author.avatarUrl,
          description: d.author.description,
          followerCount: d.author.followerCount,
          subscribedAt: Date.now(),
        });
        toast({
          title: t("sub.dialog.success"),
          description: t("sub.dialog.success.desc", { user: d.author.username, n: d.videos?.length ?? 0 }),
        });
        setOpen(false);
        setInputUsername("");
        openAuthor(d.author.username);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: t("sub.dialog.fail"),
          description: e?.message ?? t("sub.dialog.fail.desc"),
        });
      }
      return;
    }

    // Local mode: use the API (persists to SQLite)
    try {
      const res = await subscribe.mutateAsync(u);
      toast({
        title: t("sub.dialog.success"),
        description: t("sub.dialog.success.desc", { user: res.author.username, n: res.storedVideos }),
      });
      setOpen(false);
      setInputUsername("");
      openAuthor(res.author.username);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: t("sub.dialog.fail"),
        description: e?.message ?? t("sub.dialog.fail.desc"),
      });
    }
  }

  // Direct mode (username provided): subscribe immediately on click.
  // Wire onClick into the children button (or render a default button).
  if (username) {
    const btn = children ?? (
      <Button size="sm" className="gap-2" disabled={subscribe.isPending}>
        {subscribe.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {t("subs.subscribe")}
      </Button>
    );
    return (
      <span onClick={handleSubscribe} className="contents">
        {btn}
      </span>
    );
  }

  // Input mode: show the dialog with a username field.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-2">
            <UserPlus className="size-4" /> {t("subs.subscribe")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sub.dialog.title")}</DialogTitle>
          <DialogDescription>{t("sub.dialog.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="username">{t("sub.dialog.username")}</Label>
          <Input
            id="username"
            placeholder={t("sub.dialog.placeholder")}
            value={inputUsername}
            onChange={(e) => setInputUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubscribe();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("sub.dialog.cancel")}
          </Button>
          <Button onClick={handleSubscribe} disabled={subscribe.isPending || !inputUsername.trim()} className="gap-2">
            {subscribe.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            {t("sub.dialog.ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
