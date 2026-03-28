"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type MasterServiceItem = {
  serviceId: string;
  serviceTitle: string;
  isEnabled: boolean;
  priceOverride: number | null;
  durationOverrideMin: number | null;
};

type MasterDetails = {
  id: string;
  name: string;
  isActive: boolean;
  tagline: string;
  services: MasterServiceItem[];
};

type Props = {
  studioId: string;
  masterId: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

export function MasterCardDrawer({ studioId, masterId, onClose, onSaved }: Props) {
  const t = UI_TEXT.studio.masterDrawer;
  const [tab, setTab] = useState<"skills" | "profile">("skills");
  const [details, setDetails] = useState<MasterDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, MasterServiceItem>>({});
  const [search, setSearch] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileTagline, setProfileTagline] = useState("");
  const [profileActive, setProfileActive] = useState(true);

  const load = async (): Promise<void> => {
    if (!masterId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ studioId });
      const masterRes = await fetch(`/api/studio/masters/${masterId}?${query.toString()}`, { cache: "no-store" });
      const masterJson = (await masterRes.json().catch(() => null)) as ApiResponse<MasterDetails> | null;
      if (!masterRes.ok || !masterJson || !masterJson.ok) {
        throw new Error(masterJson && !masterJson.ok ? masterJson.error.message : `API error: ${masterRes.status}`);
      }

      setDetails(masterJson.data);
      setProfileName(masterJson.data.name);
      setProfileTagline(masterJson.data.tagline);
      setProfileActive(masterJson.data.isActive);
      setEdited(Object.fromEntries(masterJson.data.services.map((item) => [item.serviceId, { ...item }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.loadMaster);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render, only re-fetch on ID change
  }, [masterId, studioId]);

  const items = useMemo(
    () =>
      Object.values(edited).filter((item) =>
        item.serviceTitle.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [edited, search]
  );

  if (!masterId) return null;

  const saveServices = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}/services`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          items: Object.values(edited).map((item) => ({
            serviceId: item.serviceId,
            isEnabled: item.isEnabled,
            priceOverride: item.priceOverride,
            durationOverrideMin: item.durationOverrideMin,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.saveServices);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioId,
          displayName: profileName.trim(),
          tagline: profileTagline.trim(),
          isActive: profileActive,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.saveProfile);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l border-border-subtle bg-bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-text-main">{details?.name ?? t.titleFallback}</div>
            <div className="text-xs text-text-sec">{details?.tagline ?? ""}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t.close}
          </Button>
        </div>

        <div className="mt-4 flex gap-2">
          {(["skills", "profile"] as const).map((item) => (
            <Button
              key={item}
              variant={tab === item ? "primary" : "secondary"}
              size="none"
              onClick={() => setTab(item)}
              className="rounded-2xl border px-3 py-1.5 text-sm"
            >
              {item === "skills" ? t.tabs.skills : t.tabs.profile}
            </Button>
          ))}
        </div>

        {loading ? <div className="mt-4 text-sm text-text-sec">{t.loading}</div> : null}
        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div>
        ) : null}

        {!loading && tab === "skills" ? (
          <div className="mt-4 space-y-3">
            <Input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.skills.searchPlaceholder}
            />
            {items.map((item) => (
              <div key={item.serviceId} className="rounded-2xl border border-border-subtle bg-bg-input/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-text-main">{item.serviceTitle}</div>
                  <label className="text-xs text-text-sec">
                    <input
                      type="checkbox"
                      checked={item.isEnabled}
                      onChange={(event) =>
                        setEdited((current) => ({
                          ...current,
                          [item.serviceId]: { ...current[item.serviceId], isEnabled: event.target.checked },
                        }))
                      }
                    />{" "}
                    {t.skills.activeLabel}
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    type="number"
                    placeholder={t.skills.pricePlaceholder}
                    value={item.priceOverride ?? ""}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [item.serviceId]: {
                          ...current[item.serviceId],
                          priceOverride: event.target.value ? Number(event.target.value) : null,
                        },
                      }))
                    }
                  />
                  <Input
                    type="number"
                    placeholder={t.skills.durationPlaceholder}
                    value={item.durationOverrideMin ?? ""}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [item.serviceId]: {
                          ...current[item.serviceId],
                          durationOverrideMin: event.target.value ? Number(event.target.value) : null,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <Button onClick={() => void saveServices()} disabled={saving}>
              {saving ? t.skills.saving : t.skills.save}
            </Button>
          </div>
        ) : null}

        {!loading && tab === "profile" ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
            <div className="text-sm font-semibold text-text-main">{t.profile.title}</div>
            <Input
              type="text"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder={t.profile.namePlaceholder}
            />
            <Input
              type="text"
              value={profileTagline}
              onChange={(event) => setProfileTagline(event.target.value)}
              placeholder={t.profile.statusPlaceholder}
            />
            <label className="text-sm text-text-sec">
              <input
                type="checkbox"
                checked={profileActive}
                onChange={(event) => setProfileActive(event.target.checked)}
              />{" "}
              {t.profile.activeLabel}
            </label>
            <Button onClick={() => void saveProfile()} disabled={saving}>
              {saving ? t.profile.saving : t.profile.save}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
