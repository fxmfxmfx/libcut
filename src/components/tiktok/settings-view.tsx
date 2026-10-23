"use client";

import { useState, useEffect, useRef } from "react";
import { Settings as SettingsIcon, Save, Trash2, Loader2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useUpdateSettings } from "@/lib/tiktok/queries";
import { useView } from "@/lib/tiktok/store";
import { useAudio } from "@/lib/tiktok/audio";
import { exportClientBackup, getUnreadableClientDataRaw, useClientData, validateClientBackup } from "@/lib/tiktok/client-data";
import { useToast } from "@/hooks/use-toast";
import { availableLangs, type Lang } from "@/lib/tiktok/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { getLocalStorageError, getUnreadablePreferencesRaw, isSafeCustomCss, localStorageErrorEvent, restorePreferences } from "@/lib/tiktok/store";

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
  const update = useUpdateSettings();
  const normalizeAudio = useAudio((s) => s.normalizeAudio);
  const setNormalizeAudio = useAudio((s) => s.setNormalizeAudio);
  const { t, setLang, setTheme, setAccent, setCustomCss, setAutoMarkSeen, lang, customCss: localCss, autoMarkSeen, theme, accent } = useView();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [draftCss, setDraftCss] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(() => getLocalStorageError());
  const importInput = useRef<HTMLInputElement>(null);
  const dataMode = useView((s) => s.dataMode);
  const modeReady = useView((s) => s.modeReady);
  const customCss = draftCss ?? localCss;
  const hasRecoveryData = !!getUnreadableClientDataRaw() || !!getUnreadablePreferencesRaw();

  useEffect(() => {
    const onStorageError = (event: Event) => {
      const value = (event as CustomEvent<string | null>).detail;
      setStorageError(value);
    };
    window.addEventListener(localStorageErrorEvent, onStorageError);
    return () => window.removeEventListener(localStorageErrorEvent, onStorageError);
  }, []);

  const copy = lang === "ru" ? {
    exportBackup: "Экспортировать резервную копию",
    importBackup: "Импортировать резервную копию",
    backupHint: "Резервная копия содержит подписки, избранное, просмотренные видео и настройки.",
    importConfirm: "Заменить локальные подписки, избранное, просмотры и настройки данными из этой резервной копии?",
    backupInvalid: "Неверный файл резервной копии или неподдерживаемая версия.",
    backupDone: "Резервная копия импортирована.",
    exportRecovery: "Экспортировать повреждённые данные",
    cssInvalid: "CSS содержит неподдерживаемые внешние ресурсы или превышает 50 КБ.",
    storageError: "Браузерное хранилище недоступно. Изменения могут не сохраниться после перезагрузки.",
    clearFailed: "Не удалось очистить данные.",
  } : {
    exportBackup: "Export backup",
    importBackup: "Import backup",
    backupHint: "The backup includes subscriptions, favorites, seen videos, and preferences.",
    importConfirm: "Replace local subscriptions, favorites, seen videos, and preferences with this backup?",
    backupInvalid: "Invalid backup file or unsupported version.",
    backupDone: "Backup imported.",
    exportRecovery: "Export damaged local data",
    cssInvalid: "CSS contains unsupported external resources or exceeds 50 KB.",
    storageError: "Browser storage is unavailable. Changes may not survive a reload.",
    clearFailed: "Could not clear data.",
  };

  function downloadBackup() {
    const backup = exportClientBackup({ lang, theme, accent, customCss: localCss, autoMarkSeen });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "libcut-client-backup-v1.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadRecoveryData() {
    const recovery = {
      format: "libcut-local-recovery-v1",
      clientDataRaw: getUnreadableClientDataRaw(),
      preferencesRaw: getUnreadablePreferencesRaw(),
    };
    const blob = new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "libcut-local-recovery.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(copy.backupInvalid);
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateClientBackup(parsed)) throw new Error(copy.backupInvalid);
      if (!confirm(copy.importConfirm)) return;
      useClientData.getState().replaceFromBackup(parsed);
      if (getLocalStorageError("clientData")) throw new Error(getLocalStorageError("clientData")!);
      restorePreferences(parsed.preferences);
      if (getLocalStorageError("preferences")) throw new Error(getLocalStorageError("preferences")!);
      toast({ description: copy.backupDone });
    } catch (error) {
      toast({ variant: "destructive", description: error instanceof Error ? error.message : copy.backupInvalid });
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  // Appearance always stays in this browser, including on local instances.
  function changeLang(l: string) {
    setLang(l as Lang);
    if (dataMode !== "client") update.mutate({ language: l });
  }
  function changeTheme(th: string) {
    setTheme(th);
  }
  function changeAccent(c: string) {
    setAccent(c);
  }
  function changeAutoMark(b: boolean) {
    setAutoMarkSeen(b);
    if (dataMode !== "client") update.mutate({ autoMarkSeen: String(b) });
  }
  function saveCss() {
    if (!isSafeCustomCss(customCss)) {
      toast({ variant: "destructive", description: copy.cssInvalid });
      return;
    }
    setCustomCss(customCss);
    setDraftCss(null);
    if (getLocalStorageError("preferences")) {
      toast({ variant: "destructive", description: getLocalStorageError("preferences")! });
      return;
    }
    toast({ description: t("settings.saved") });
  }

  async function clearData() {
    if (!confirm(t("settings.clearData"))) return;
    setClearing(true);
    try {
      if (useView.getState().dataMode === "client") {
        useClientData.getState().clearAll();
        if (getLocalStorageError("clientData")) throw new Error(getLocalStorageError("clientData")!);
      } else {
        const response = await fetch("/api/tiktok/clear-data", { method: "DELETE" });
        if (!response.ok) throw new Error(`${copy.clearFailed} (HTTP ${response.status})`);
      }
      qc.invalidateQueries();
      toast({ description: t("settings.cleared") });
    } catch (error) {
      toast({ variant: "destructive", description: error instanceof Error ? error.message : copy.clearFailed });
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

      {update.error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{update.error.message}</p>}
      {/* Appearance */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("settings.theme")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((th) => (
            <button
              key={th.value}
              onClick={() => changeTheme(th.value)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  theme === th.value
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
                  accent === c ? "border-foreground" : "border-transparent"
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
          <Select value={lang} onValueChange={changeLang}>
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
            onChange={(e) => setDraftCss(e.target.value)}
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

      {/* Behavior */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">{t("settings.behavior")}</h2>
        <div className="flex items-center justify-between">
          <Label htmlFor="autoMark" className="text-sm">
            {t("settings.autoMarkSeen")}
          </Label>
          <Switch
            id="autoMark"
            checked={autoMarkSeen}
            onCheckedChange={changeAutoMark}
          />
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="normalizeAudio" className="text-sm">
              {lang === "ru" ? "Выравнивание громкости" : "Normalize audio"}
            </Label>
            <p className="max-w-lg text-xs text-muted-foreground">
              {lang === "ru" ? "Уменьшает разницу громкости между роликами. Перед первым запуском сервер обрабатывает всю аудиодорожку — это занимает время и задерживает воспроизведение, особенно у длинных роликов. Сохраняется в этом браузере." : "Reduces volume differences between videos. The server processes the entire audio track before first playback, which takes time and delays playback, especially for longer videos. Saved in this browser."}
            </p>
          </div>
          <Switch id="normalizeAudio" checked={normalizeAudio} onCheckedChange={setNormalizeAudio} />
        </div>

        <Separator />

        {/* Data storage mode (read-only — set via DATA_MODE env var) */}
        <div>
          <Label className="text-sm font-semibold">{t("settings.dataMode")}</Label>
          <div className="mt-2 rounded-lg border border-border/60 p-3 text-sm">
            <div className="font-medium">
              {dataMode === "client"
                ? t("settings.dataMode.client")
                : t("settings.dataMode.local")}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {dataMode === "client"
                ? t("settings.dataMode.client.desc")
                : t("settings.dataMode.local.desc")}
            </p>
          </div>
          {dataMode === "local" && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
              {t("settings.dataMode.warning")}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t("settings.dataMode.env")}
          </p>
        </div>
      </Card>

      {modeReady && dataMode === "client" && (
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">{copy.exportBackup}</h2>
          <p className="text-xs text-muted-foreground">{copy.backupHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadBackup}>
              <Download className="size-4" /> {copy.exportBackup}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => importInput.current?.click()}>
              <Upload className="size-4" /> {copy.importBackup}
            </Button>
            <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importBackup(event.target.files?.[0])} />
          </div>
        </Card>
      )}

      {hasRecoveryData && (
        <Card className="space-y-3 border-amber-500/30 p-5">
          <p className="text-xs text-amber-400">{storageError}</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={downloadRecoveryData}>
            <Download className="size-4" /> {copy.exportRecovery}
          </Button>
        </Card>
      )}

      {storageError && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
          {storageError || copy.storageError}
        </div>
      )}

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
