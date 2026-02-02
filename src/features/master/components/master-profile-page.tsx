/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterServiceItem = {
  serviceId: string;
  title: string;
  isEnabled: boolean;
  basePrice: number;
  baseDurationMin: number;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  effectivePrice: number;
  effectiveDurationMin: number;
  canEditPrice: boolean;
};

type PortfolioItem = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  serviceIds: string[];
  createdAt: string;
};

type MasterProfileData = {
  master: {
    id: string;
    displayName: string;
    tagline: string;
    bio: string | null;
    avatarUrl: string | null;
    isPublished: boolean;
    isSolo: boolean;
    ratingAvg: number;
    ratingCount: number;
  };
  services: MasterServiceItem[];
  portfolio: PortfolioItem[];
};

export function MasterProfilePage() {
  const [data, setData] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [servicesDraft, setServicesDraft] = useState<Record<string, MasterServiceItem>>({});

  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [portfolioCaption, setPortfolioCaption] = useState("");
  const [portfolioServiceIds, setPortfolioServiceIds] = useState<string[]>([]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master/profile", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MasterProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setData(json.data);
      setDisplayName(json.data.master.displayName);
      setTagline(json.data.master.tagline);
      setBio(json.data.master.bio ?? "");
      setAvatarUrl(json.data.master.avatarUrl ?? "");
      setIsPublished(json.data.master.isPublished);
      setServicesDraft(Object.fromEntries(json.data.services.map((item) => [item.serviceId, item])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const serviceList = useMemo(() => Object.values(servicesDraft), [servicesDraft]);

  const saveProfile = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          tagline: tagline.trim(),
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim() || null,
          isPublished,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const saveServices = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: serviceList.map((item) => ({
            serviceId: item.serviceId,
            isEnabled: item.isEnabled,
            durationOverrideMin: item.canEditPrice
              ? item.effectiveDurationMin
              : item.durationOverrideMin,
            priceOverride: item.canEditPrice ? item.effectivePrice : undefined,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save services");
    } finally {
      setSaving(false);
    }
  };

  const addPortfolio = async (): Promise<void> => {
    if (!portfolioUrl.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: portfolioUrl.trim(),
          caption: portfolioCaption.trim() || undefined,
          serviceIds: portfolioServiceIds,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setPortfolioUrl("");
      setPortfolioCaption("");
      setPortfolioServiceIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add portfolio item");
    } finally {
      setSaving(false);
    }
  };

  const removePortfolio = async (id: string): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/portfolio/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove portfolio item");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return <div className="rounded-2xl border p-5 text-sm">Loading profile...</div>;
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border p-4">
          <h3 className="text-sm font-semibold">Профиль и витрина</h3>
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Имя" />
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Тэглайн" />
            <textarea className="w-full rounded-lg border px-3 py-2 text-sm" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="О себе" />
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="URL аватара" />
            <label className="text-sm">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Опубликован
            </label>
            <button type="button" onClick={() => void saveProfile()} disabled={saving} className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60">
              Сохранить профиль
            </button>
          </div>
        </div>

        <div className="rounded-2xl border p-4">
          <h3 className="text-sm font-semibold">Предпросмотр витрины</h3>
          <div className="mt-3 rounded-xl border p-3">
            {avatarUrl ? <img src={avatarUrl} alt="avatar" className="h-24 w-24 rounded-2xl object-cover" /> : <div className="h-24 w-24 rounded-2xl bg-neutral-100" />}
            <div className="mt-2 font-semibold">{displayName || "Без имени"}</div>
            <div className="text-sm text-neutral-600">{tagline}</div>
            <div className="text-sm text-neutral-600">{bio}</div>
            <div className="mt-2 text-xs text-neutral-500">⭐ {data.master.ratingAvg.toFixed(1)} · {data.master.ratingCount} отзывов</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Мои услуги</h3>
        <div className="mt-3 space-y-2">
          {serviceList.map((service) => (
            <div key={service.serviceId} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{service.title}</div>
                <label className="text-xs">
                  <input
                    type="checkbox"
                    checked={service.isEnabled}
                    onChange={(e) =>
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: { ...current[service.serviceId], isEnabled: e.target.checked },
                      }))
                    }
                  />{" "}
                  Делаю
                </label>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  className="rounded border px-2 py-1 text-sm"
                  value={service.effectiveDurationMin}
                  onChange={(e) =>
                    setServicesDraft((current) => ({
                      ...current,
                      [service.serviceId]: {
                        ...current[service.serviceId],
                        effectiveDurationMin: Number(e.target.value) || 0,
                        durationOverrideMin: Number(e.target.value) || null,
                      },
                    }))
                  }
                />
                <input
                  type="number"
                  className="rounded border px-2 py-1 text-sm"
                  value={service.effectivePrice}
                  disabled={!service.canEditPrice}
                  onChange={(e) =>
                    setServicesDraft((current) => ({
                      ...current,
                      [service.serviceId]: {
                        ...current[service.serviceId],
                        effectivePrice: Number(e.target.value) || 0,
                        priceOverride: Number(e.target.value) || null,
                      },
                    }))
                  }
                />
              </div>
              {!service.canEditPrice ? (
                <div className="mt-1 text-xs text-neutral-500">Цена управляется студией, доступен только тайминг.</div>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => void saveServices()} disabled={saving} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-60">
            Сохранить услуги
          </button>
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Портфолио</h3>
        <div className="mt-3 grid gap-2">
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="URL фото" />
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={portfolioCaption} onChange={(e) => setPortfolioCaption(e.target.value)} placeholder="Подпись" />
          <div className="rounded-lg border p-2">
            <div className="mb-1 text-xs text-neutral-600">Какая это услуга?</div>
            <div className="flex flex-wrap gap-2">
              {serviceList.map((service) => (
                <label key={`portfolio-${service.serviceId}`} className="text-xs">
                  <input
                    type="checkbox"
                    checked={portfolioServiceIds.includes(service.serviceId)}
                    onChange={(e) =>
                      setPortfolioServiceIds((current) =>
                        e.target.checked
                          ? [...current, service.serviceId]
                          : current.filter((id) => id !== service.serviceId)
                      )
                    }
                  />{" "}
                  {service.title}
                </label>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => void addPortfolio()} disabled={saving} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-60">
            + Добавить фото
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.portfolio.map((item) => (
            <div key={item.id} className="rounded-xl border p-2">
              <img src={item.mediaUrl} alt="portfolio" className="h-40 w-full rounded-lg object-cover" />
              {item.caption ? <div className="mt-1 text-xs text-neutral-600">{item.caption}</div> : null}
              <div className="mt-1 text-[11px] text-neutral-500">Услуг: {item.serviceIds.length}</div>
              <button type="button" onClick={() => void removePortfolio(item.id)} className="mt-2 rounded border px-2 py-1 text-xs text-red-600">
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
