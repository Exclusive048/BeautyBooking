"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginHeroImageManager } from "@/features/media/components/login-hero-image-manager";
import { SiteLogoManager } from "@/features/media/components/site-logo-manager";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type SettingsResponse = {
  seoTitle: string | null;
  seoDescription: string | null;
};

type SystemConfigResponse = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
};

type QueueStats = {
  pending: number;
  processing: number;
  dead: number;
};

type DeadJob = {
  queueIndex: number;
  job: { type: string; createdAt?: number; retryCount?: number };
};

type QueueResponse = {
  stats: QueueStats;
  deadJobs: DeadJob[];
};

type VisualSearchStats = {
  total: number;
  indexed: number;
  unrecognized: number;
};

type MediaCleanupStats = {
  stalePendingCount: number;
  brokenCount: number;
  staleBefore: string;
};

type AppSettingItem = {
  key: string;
  value: string;
  updatedAt: string;
};

// ─── Queue Panel ────────────────────────────────────────────────────────────

function QueuePanel() {
  const t = UI_TEXT.admin.settings.queue;
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/queue", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<QueueResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = async (index: number) => {
    setBusyIndex(index);
    try {
      const res = await fetch(`/api/admin/queue/${index}`, { method: "PATCH" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) throw new Error(t.retryFailed);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.retryFailed);
    } finally {
      setBusyIndex(null);
    }
  };

  const remove = async (index: number) => {
    setBusyIndex(index);
    try {
      const res = await fetch(`/api/admin/queue/${index}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) throw new Error(t.deleteFailed);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed);
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-text-main">{t.title}</div>
            <p className="text-sm text-text-sec">{t.subtitle}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {UI_TEXT.admin.dashboard.refresh}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t.pending, value: data.stats.pending },
                { label: t.processing, value: data.stats.processing },
                { label: t.dead, value: data.stats.dead },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-border-subtle bg-bg-input p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-text-main">{value}</div>
                  <div className="mt-1 text-xs text-text-sec">{label}</div>
                </div>
              ))}
            </div>

            {data.deadJobs.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold text-text-sec">{t.deadList}</div>
                <div className="space-y-2">
                  {data.deadJobs.map((item) => (
                    <div
                      key={item.queueIndex}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-input px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-mono text-text-main">{item.job.type}</span>
                        {item.job.retryCount !== undefined ? (
                          <span className="ml-2 text-xs text-text-sec">×{item.job.retryCount}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busyIndex === item.queueIndex}
                          onClick={() => void retry(item.queueIndex)}
                        >
                          {busyIndex === item.queueIndex ? t.retrying : t.retry}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyIndex === item.queueIndex}
                          onClick={() => void remove(item.queueIndex)}
                        >
                          {t.delete}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-sec">{t.deadEmpty}</div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Visual Search Panel ─────────────────────────────────────────────────────

function VisualSearchPanel() {
  const t = UI_TEXT.admin.settings.visualSearch;
  const [stats, setStats] = useState<VisualSearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/visual-search/stats", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<VisualSearchStats> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      setStats(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const reindex = async () => {
    setReindexing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/visual-search/reindex", { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.reindexFailed);
      }
      setToast(t.reindexed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.reindexFailed);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="text-base font-semibold text-text-main">{t.title}</div>
        <p className="text-sm text-text-sec">{t.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {toast ? (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
            {toast}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t.total, value: stats.total },
              { label: t.indexed, value: stats.indexed },
              { label: t.unindexed, value: stats.total - stats.indexed },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border-subtle bg-bg-input p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-text-main">{value}</div>
                <div className="mt-1 text-xs text-text-sec">{label}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => void reindex()} disabled={reindexing}>
            {reindexing ? t.reindexing : t.reindex}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Media Cleanup Panel ─────────────────────────────────────────────────────

function MediaCleanupPanel() {
  const t = UI_TEXT.admin.settings.mediaCleanup;
  const [stats, setStats] = useState<MediaCleanupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/broken", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ stats: MediaCleanupStats }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      setStats(json.data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const runCleanup = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/broken", { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.runFailed);
      }
      setToast(t.done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.runFailed);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="text-base font-semibold text-text-main">{t.title}</div>
        <p className="text-sm text-text-sec">{t.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}
        {toast ? (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
            {toast}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t.staleLabel, value: stats.stalePendingCount },
              { label: t.brokenLabel, value: stats.brokenCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border-subtle bg-bg-input p-3 text-center">
                <div className="text-2xl font-bold tabular-nums text-text-main">{value}</div>
                <div className="mt-1 text-xs text-text-sec">{label}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => void runCleanup()} disabled={running}>
            {running ? t.running : t.run}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AppSettings Panel ────────────────────────────────────────────────────────

function AppSettingsPanel() {
  const t = UI_TEXT.admin.settings.appSettings;
  const [settings, setSettings] = useState<AppSettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/app-settings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        settings: AppSettingItem[];
      }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      setSettings(json.data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (item: AppSettingItem) => {
    setEditingKey(item.key);
    setEditingValue(item.value);
    setSavedKey(null);
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editingKey, value: editingValue }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.saveFailed);
      }
      setSettings((prev) =>
        prev.map((s) => (s.key === editingKey ? { ...s, value: editingValue } : s))
      );
      setSavedKey(editingKey);
      setEditingKey(null);
      setEditingValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="text-base font-semibold text-text-main">{t.title}</div>
        <p className="text-sm text-text-sec">{t.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div>
        ) : settings.length === 0 ? (
          <div className="text-sm text-text-sec">{t.empty}</div>
        ) : (
          <div className="divide-y divide-border-subtle/60">
            {settings.map((item) => (
              <div key={item.key} className="py-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-text-main">{item.key}</span>
                  {savedKey === item.key ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">{t.saved}</span>
                  ) : null}
                </div>
                {editingKey === item.key ? (
                  <div className="flex gap-2">
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button size="sm" onClick={() => void saveEdit()} disabled={saving}>
                      {saving ? t.saving : t.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingKey(null)}
                      disabled={saving}
                    >
                      {UI_TEXT.actions.cancel}
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => startEdit(item)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(item); }}
                    className="cursor-pointer rounded-lg border border-border-subtle bg-bg-input px-3 py-2 font-mono text-sm text-text-sec hover:border-border-main"
                  >
                    {item.value || <span className="italic text-text-sec/50">{t.emptyValue}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminSettings() {
  const t = UI_TEXT.admin.settings;
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [onlinePaymentsEnabled, setOnlinePaymentsEnabled] = useState(false);
  const [visualSearchEnabled, setVisualSearchEnabled] = useState(false);
  const [flagsSaving, setFlagsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, flagsRes] = await Promise.all([
          fetch("/api/admin/settings", { cache: "no-store" }),
          fetch("/api/admin/system-config", { cache: "no-store" }),
        ]);
        const json = (await settingsRes.json().catch(() => null)) as ApiResponse<SettingsResponse> | null;
        if (!settingsRes.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
        }
        setSeoTitle(json.data.seoTitle ?? "");
        setSeoDescription(json.data.seoDescription ?? "");

        const flagsJson = (await flagsRes.json().catch(() => null)) as ApiResponse<SystemConfigResponse> | null;
        if (flagsRes.ok && flagsJson && flagsJson.ok) {
          setOnlinePaymentsEnabled(Boolean(flagsJson.data.onlinePaymentsEnabled));
          setVisualSearchEnabled(Boolean(flagsJson.data.visualSearchEnabled));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t.loadFailed);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t.loadFailed]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<SettingsResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.saveFailed);
      }
      setSuccess(t.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    setFlagsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlinePaymentsEnabled, visualSearchEnabled }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<SystemConfigResponse> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.saveFailed);
      }
      setOnlinePaymentsEnabled(Boolean(json.data.onlinePaymentsEnabled));
      setVisualSearchEnabled(Boolean(json.data.visualSearchEnabled));
      setSuccess(t.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setFlagsSaving(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{UI_TEXT.common.loading}</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">{t.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/40 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-base font-semibold text-text-main">{t.logoTitle}</div>
            <p className="text-sm text-text-sec">{t.logoSubtitle}</p>
          </CardHeader>
          <CardContent>
            <SiteLogoManager />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-base font-semibold text-text-main">{t.loginHeroTitle}</div>
            <p className="text-sm text-text-sec">{t.loginHeroSubtitle}</p>
          </CardHeader>
          <CardContent>
            <LoginHeroImageManager />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold text-text-main">{t.flagsTitle}</div>
          <p className="text-sm text-text-sec">{t.flagsSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm text-text-main">
            <span>{t.onlinePaymentsEnabled}</span>
            <Switch
              checked={onlinePaymentsEnabled}
              onCheckedChange={setOnlinePaymentsEnabled}
              aria-label={t.onlinePaymentsEnabled}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-text-main">
            <span>{t.visualSearchEnabled}</span>
            <Switch
              checked={visualSearchEnabled}
              onCheckedChange={setVisualSearchEnabled}
              aria-label={t.visualSearchEnabled}
            />
          </label>
          <div className="flex justify-end">
            <Button onClick={() => void saveFlags()} disabled={flagsSaving}>
              {flagsSaving ? t.savingFlags : t.saveFlags}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold text-text-main">{t.seoTitle}</div>
          <p className="text-sm text-text-sec">{t.seoSubtitle}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-sec">{t.seoTitleLabel}</label>
            <Input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-sec">{t.seoDescriptionLabel}</label>
            <Textarea
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
            </Button>
          </div>
        </CardContent>
      </Card>

      <QueuePanel />

      <div className="grid gap-4 md:grid-cols-2">
        <VisualSearchPanel />
        <MediaCleanupPanel />
      </div>

      <AppSettingsPanel />
    </section>
  );
}
