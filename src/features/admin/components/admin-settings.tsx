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
          throw new Error(
            json && !json.ok ? json.error.message : UI_TEXT.admin.settings.loadFailed
          );
        }
        setSeoTitle(json.data.seoTitle ?? "");
        setSeoDescription(json.data.seoDescription ?? "");

        const flagsJson = (await flagsRes.json().catch(() => null)) as ApiResponse<SystemConfigResponse> | null;
        if (flagsRes.ok && flagsJson && flagsJson.ok) {
          setOnlinePaymentsEnabled(Boolean(flagsJson.data.onlinePaymentsEnabled));
          setVisualSearchEnabled(Boolean(flagsJson.data.visualSearchEnabled));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : UI_TEXT.admin.settings.loadFailed
        );
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

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
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
            <Button onClick={saveFlags} disabled={flagsSaving}>
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
            <Button onClick={save} disabled={saving}>
              {saving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
