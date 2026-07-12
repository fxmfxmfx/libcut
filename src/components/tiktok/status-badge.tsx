"use client";

import { ShieldCheck, ShieldAlert, FlaskConical, ShieldX, Loader2 } from "lucide-react";
import { useStatus, useProxyCheck } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export function StatusBadge() {
  const { data, isLoading } = useStatus();
  const proxyCheck = useProxyCheck();
  const { t } = useView();

  if (isLoading || !data) {
    return (
      <Badge variant="outline" className="gap-1 opacity-60">
        <ShieldCheck className="size-3" /> …
      </Badge>
    );
  }

  if (data.demoMode) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-400">
              <FlaskConical className="size-3" /> {t("status.demo")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{t("status.demo.tip")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!data.proxyConfigured) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-400">
              <ShieldAlert className="size-3" /> {t("status.noproxy")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{t("status.noproxy.tip")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Proxy is configured — check if it actually works.
  if (proxyCheck.isLoading) {
    return (
      <Badge variant="outline" className="gap-1 border-blue-500/40 bg-blue-500/10 text-blue-400">
        <Loader2 className="size-3 animate-spin" /> {t("status.checking")}
      </Badge>
    );
  }

  if (proxyCheck.data && !proxyCheck.data.ok) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 border-destructive/40 bg-destructive/10 text-destructive cursor-pointer"
              onClick={() => proxyCheck.refetch()}
            >
              <ShieldX className="size-3" /> {t("status.proxybad")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {proxyCheck.data.error ?? "Proxy is not working"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="size-3" /> {t("status.proxy")}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {t("status.proxy.tip", { n: String(data.cacheTtlMin) })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
