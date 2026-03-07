"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginHeroImageManager } from "@/features/media/components/login-hero-image-manager";
import { SiteLogoManager } from "@/features/media/components/site-logo-manager";
import type { ApiResponse } from "@/lib/types/api";

type SettingsResponse = {
  seoTitle: string | null;
  seoDescription: string | null;
};

type SystemConfigResponse = {
  onlinePaymentsEnabled: boolean;
  visualSearchEnabled: boolean;
};

export function AdminSettings() {
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
          throw new Error(json && !json.ok ? json.error.message : "Failed to load settings");
        }
        setSeoTitle(json.data.seoTitle ?? "");
        setSeoDescription(json.data.seoDescription ?? "");

        const flagsJson = (await flagsRes.json().catch(() => null)) as ApiResponse<SystemConfigResponse> | null;
        if (flagsRes.ok && flagsJson && flagsJson.ok) {
          setOnlinePaymentsEnabled(Boolean(flagsJson.data.onlinePaymentsEnabled));
          setVisualSearchEnabled(Boolean(flagsJson.data.visualSearchEnabled));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

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
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить настройки");
      }
      setSuccess("Настройки сохранены.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить настройки");
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
        throw new Error(json && !json.ok ? json.error.message : "Failed to save settings");
      }
      setOnlinePaymentsEnabled(Boolean(json.data.onlinePaymentsEnabled));
      setVisualSearchEnabled(Boolean(json.data.visualSearchEnabled));
      setSuccess("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setFlagsSaving(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка…</div>;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-main">Настройки системы</h1>
        <p className="mt-1 text-sm text-text-sec">Базовые параметры бренда и SEO.</p>
      </header>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-base font-semibold text-text-main">Логотип сервиса</div>
            <p className="text-sm text-text-sec">Используется в верхней панели и публичных страницах.</p>
          </CardHeader>
          <CardContent>
            <SiteLogoManager />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-base font-semibold text-text-main">Баннеры страницы входа</div>
            <p className="text-sm text-text-sec">Фоновое изображение на странице /login.</p>
          </CardHeader>
          <CardContent>
            <LoginHeroImageManager />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold text-text-main">System flags</div>
          <p className="text-sm text-text-sec">Global feature toggles for the platform.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm text-text-main">
            <span>Online payments enabled (global)</span>
            <input
              type="checkbox"
              checked={onlinePaymentsEnabled}
              onChange={(event) => setOnlinePaymentsEnabled(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-text-main">
            <span>Visual search enabled (global)</span>
            <input
              type="checkbox"
              checked={visualSearchEnabled}
              onChange={(event) => setVisualSearchEnabled(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
          <div className="flex justify-end">
            <Button onClick={saveFlags} disabled={flagsSaving}>
              {flagsSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-base font-semibold text-text-main">SEO-настройки</div>
          <p className="text-sm text-text-sec">Заголовок и описание для поисковых систем.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-sec">SEO-заголовок</label>
            <Input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-sec">SEO-описание</label>
            <Textarea
              value={seoDescription}
              onChange={(event) => setSeoDescription(event.target.value)}
              rows={4}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
