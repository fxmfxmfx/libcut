"use client";

import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Save, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSettings, useUpdateSettings, useStatus, useProxyCheck } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useClientData } from "@/lib/tiktok/client-data";
import { useToast } from "@/hooks/use-toast";
import { availableLangs, type Lang } from "@/lib/tiktok/i18n";
import { useQueryClient } from "@tanstack/react-query";

const THEMES = [
  { value: "default", key: "theme.default" },
  { value: "gruvbox", key: "theme.gruvbox" },
  { value: "catppuccin", key: "theme.catppuccin" },
  { value: "nord", key: "theme.nord" },
  { value: "dracula", key: "theme.dracula" },
  { value: "light", key: "theme.light" },
];

const ACCENTS = ["#fe2c55", "#25f4ee", "#a78bfa", "#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#fb923c"];

export function SettingsView() {
  const { data } = useSettings();
  const update = useUpdateSettings();
  const status = useStatus();
  const proxyCheck = useProxyCheck();
  const { t, setLang, setTheme, setAccent, setCustomCss, setAutoMarkSeen } = useView();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [proxyEnabled, setProxyEnabled] = useState(true);
  const [proxyUrl, setProxyUrl] = useState("");
  const [customCss, setCss] = useState("");
  const [clearing, setClearing] = useState(false);

  // Sync local form state once settings load.
  useEffect(() => {
    if (data) {
      setProxyEnabled(data.settings.proxyEnabled !== "false");
      setProxyUrl(data.settings.proxyUrl);
      setCss(data.settings.customCss);
    }
  }, [data]);

  async function saveProxy() {
    await update.mutateAsync({
      proxyEnabled: String(proxyEnabled),
      proxyUrl,
    });
    toast({ description: t("settings.saved") });
  }

  function changeLang(l: string) {
    setLang(l as Lang);
    update.mutate({ language: l });
  }
  function changeTheme(th: string) {
    setTheme(th);
    update.mutate({ theme: th });
  }
  function changeAccent(c: string) {
    setAccent(c);
    update.mutate({ accent: c });
  }
  function changeAutoMark(b: boolean) {
    setAutoMarkSeen(b);
    update.mutate({ autoMarkSeen: String(b) });
  }
  function saveCss() {
    setCustomCss(customCss);
    update.mutate({ customCss });
    toast({ description: t("settings.saved") });
  }

  async function clearData() {
    if (!confirm(t("settings.clearData"))) return;
    setClearing(true);
    try {
      if (useView.getState().dataMode === "client") {
        useClientData.getState().clearAll();
      } else {
        await fetch("/api/tiktok/clear-data", { method: "DELETE" });
      }
      qc.invalidateQueries();
      toast({ description: t("settings.cleared") });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <SettingsIcon className="size-5 text-primary" /> {t("settings.title")}
        </h1>
      </div>

      {/* Appearance */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("settings.theme")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((th) => (
            <button
              key={th.value}
              onClick={() => changeTheme(th.value)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                useView.getState().theme === th.value
                  ? "border-primary bg-primary/10"
                  : "border-border/60 hover:border-primary/40"
              }`}
            >
              <div className="font-medium">{t(th.key)}</div>
            </button>
          ))}
        </div>

        <Separator />

        <div>
          <Label className="text-sm font-semibold">{t("settings.accent")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                onClick={() => changeAccent(c)}
                className={`size-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  useView.getState().accent === c ? "border-foreground" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <label className="size-8 cursor-pointer rounded-full border-2 border-dashed border-border/60 grid place-items-center text-xs text-muted-foreground hover:border-primary">
              +
              <input
                type="color"
                className="sr-only"
                onChange={(e) => changeAccent(e.target.value)}
              />
            </label>
          </div>
        </div>

        <Separator />

        <div>
          <Label htmlFor="lang" className="text-sm font-semibold">
            {t("settings.language")}
          </Label>
          <Select value={useView.getState().lang} onValueChange={changeLang}>
            <SelectTrigger id="lang" className="mt-1.5 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLangs.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div>
          <Label htmlFor="css" className="text-sm font-semibold">
            {t("settings.customCss")}
          </Label>
          <Textarea
            id="css"
            value={customCss}
            onChange={(e) => setCss(e.target.value)}
            placeholder={t("settings.customCss.placeholder")}
            className="mt-1.5 min-h-[120px] font-mono text-xs"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={saveCss} disabled={update.isPending}>
              <Save className="size-4" /> {t("settings.save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Proxy */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("settings.proxy")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.proxy.desc")}</p>

        <div className="flex items-center justify-between">
          <Label htmlFor="proxyEnabled" className="text-sm">
            {t("settings.proxy.enabled")}
          </Label>
          <Switch id="proxyEnabled" checked={proxyEnabled} onCheckedChange={setProxyEnabled} />
        </div>

        <div>
          <Label htmlFor="proxyUrl" className="text-sm">
            {t("settings.proxy.url")}
          </Label>
          <Input
            id="proxyUrl"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder={t("settings.proxy.url.placeholder")}
            className="mt-1.5 font-mono text-xs"
          />
          {data?.envProxy && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("settings.proxy.env", { url: data.envProxy })}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={saveProxy} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t("settings.save")}
          </Button>
        </div>
      </Card>

      {/* Behavior */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("settings.behavior")}</h2>
        <div className="flex items-center justify-between">
          <Label htmlFor="autoMark" className="text-sm">
            {t("settings.autoMarkSeen")}
          </Label>
          <Switch
            id="autoMark"
            checked={useView.getState().autoMarkSeen}
            onCheckedChange={changeAutoMark}
          />
        </div>

        <Separator />

        {/* Data storage mode (read-only — set via DATA_MODE env var) */}
        <div>
          <Label className="text-sm font-semibold">{t("settings.dataMode")}</Label>
          <div className="mt-2 rounded-lg border border-border/60 p-3 text-sm">
            <div className="font-medium">
              {useView.getState().dataMode === "client"
                ? t("settings.dataMode.client")
                : t("settings.dataMode.local")}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {useView.getState().dataMode === "client"
                ? t("settings.dataMode.client.desc")
                : t("settings.dataMode.local.desc")}
            </p>
          </div>
          {useView.getState().dataMode === "local" && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
              {t("settings.dataMode.warning")}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("settings.dataMode.env")}
          </p>
        </div>
      </Card>

      {/* System Info */}
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">{t("settings.system")}</h2>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Demo mode</span>
            <span className="font-mono">{status.data?.demoMode ? "on" : "off"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">yt-dlp path</span>
            <span className="font-mono">{status.data?.ytdlpPath ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cache TTL</span>
            <span className="font-mono">{status.data?.cacheTtlMin ?? "—"} min</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Env proxy</span>
            <span className="font-mono truncate max-w-[200px]">{data?.envProxy || "—"}</span>
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("settings.proxy.test")}</p>
            <p className="text-xs text-muted-foreground">
              {proxyCheck.isLoading
                ? t("status.checking")
                : proxyCheck.data?.ok
                  ? `✓ ${t("status.proxy")}`
                  : proxyCheck.data?.error
                    ? `✗ ${proxyCheck.data.error}`
                    : "—"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => proxyCheck.refetch()}
          >
            <RefreshCw className="size-4" /> {t("settings.proxy.recheck")}
          </Button>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="space-y-3 border-destructive/30 p-5">
        <h2 className="text-sm font-semibold text-destructive">{t("settings.danger")}</h2>
        <Button variant="outline" size="sm" onClick={clearData} disabled={clearing} className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
          {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {t("settings.clearData")}
        </Button>
      </Card>
    </div>
  );
}
