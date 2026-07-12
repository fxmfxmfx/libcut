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
import { ExternalLink } from "lucide-react";
import { useView } from "@/lib/tiktok/store";

/**
 * Confirmation dialog before opening a real tiktok.com link (which has
 * tracking + ads). Renders a trigger button; clicking opens the dialog, and
 * confirming opens the external URL.
 */
export function ExternalLinkButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useView();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="ghost" size="sm" className={className}>
            <ExternalLink className="size-4" /> {t("author.openOriginal")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="size-5 text-primary" /> {t("ext.warn.title")}
          </DialogTitle>
          <DialogDescription>{t("ext.warn.desc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("ext.warn.cancel")}
          </Button>
          <Button asChild className="gap-2">
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <ExternalLink className="size-4" /> {t("ext.warn.continue")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
