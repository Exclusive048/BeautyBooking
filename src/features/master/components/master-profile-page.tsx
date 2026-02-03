/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";

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

type PendingPortfolioMeta = {
  assetId: string;
  mediaUrl: string;
};

type ApiErrorShape = {
  ok: false;
  error: {
    message: string;
    details?: unknown;
  };
};

function parseMediaAssetId(url: string): string | null {
  const match = url.match(/\/api\/media\/file\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function toAbsoluteMediaUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

function extractApiErrorMessage(
  json: ApiErrorShape | null,
  fallback: string
): string {
  if (!json || json.ok) return fallback;
  const details = json.error.details;
  if (typeof details === "string" && details.trim()) {
    return `${json.error.message}: ${details}`;
  }
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "message" in first) {
      const value = first.message;
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  if (details && typeof details === "object" && "issues" in details) {
    const issues = (details as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0];
      if (first && typeof first === "object" && "message" in first) {
        const message = (first as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message;
      }
    }
  }
  return json.error.message || fallback;
}

async function uploadMasterMedia(input: {
  file: File;
  masterId: string;
  kind: "AVATAR" | "PORTFOLIO";
  replaceAssetId?: string;
}): Promise<MediaAssetDto> {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("entityType", "MASTER");
  formData.set("entityId", input.masterId);
  formData.set("kind", input.kind);
  if (input.replaceAssetId) formData.set("replaceAssetId", input.replaceAssetId);

  const res = await fetch("/api/media", { method: "POST", body: formData });
  const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
  if (!res.ok || !json || !json.ok) {
    throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
  }
  return json.data.asset;
}

export function MasterProfilePage() {
  const [data, setData] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveInfo, setAutosaveInfo] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [servicesDraft, setServicesDraft] = useState<Record<string, MasterServiceItem>>({});

  const [newSoloServiceTitle, setNewSoloServiceTitle] = useState("");
  const [newSoloServicePrice, setNewSoloServicePrice] = useState<number>(0);
  const [newSoloServiceDuration, setNewSoloServiceDuration] = useState<number>(60);
  const [showAddServicePanel, setShowAddServicePanel] = useState(false);
  const [selectedStudioServiceId, setSelectedStudioServiceId] = useState("");
  const [serviceFieldErrors, setServiceFieldErrors] = useState<
    Record<string, { price?: string; duration?: string }>
  >({});

  const [pendingPortfolioMeta, setPendingPortfolioMeta] = useState<PendingPortfolioMeta | null>(null);
  const [portfolioCaption, setPortfolioCaption] = useState("");
  const [portfolioServiceIds, setPortfolioServiceIds] = useState<string[]>([]);
  const [portfolioMetaOpen, setPortfolioMetaOpen] = useState(false);
  const [portfolioAssetIdsByUrl, setPortfolioAssetIdsByUrl] = useState<Record<string, string>>({});

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const newPortfolioInputRef = useRef<HTMLInputElement | null>(null);
  const serviceAutosaveTimer = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/master/profile", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MasterProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      const profileData = json.data;
      setData(profileData);
      setDisplayName(profileData.master.displayName);
      setTagline(profileData.master.tagline);
      setBio(profileData.master.bio ?? "");
      setAvatarUrl(profileData.master.avatarUrl ?? "");
      setServicesDraft(Object.fromEntries(profileData.services.map((item) => [item.serviceId, item])));

      const [avatarRes, portfolioRes] = await Promise.all([
        fetch(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=AVATAR`, { cache: "no-store" }),
        fetch(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=PORTFOLIO`, { cache: "no-store" }),
      ]);

      const avatarJson = (await avatarRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (avatarRes.ok && avatarJson && avatarJson.ok) {
        setAvatarAssetId(avatarJson.data.assets[0]?.id ?? null);
      }

      const portfolioJson = (await portfolioRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (portfolioRes.ok && portfolioJson && portfolioJson.ok) {
        const map: Record<string, string> = {};
        for (const asset of portfolioJson.data.assets) {
          map[asset.url] = asset.id;
        }
        setPortfolioAssetIdsByUrl(map);
      }

      hydratedRef.current = false;
      setAutosaveInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const serviceList = useMemo(() => Object.values(servicesDraft), [servicesDraft]);
  const disabledServices = useMemo(
    () => serviceList.filter((service) => !service.isEnabled),
    [serviceList]
  );

  function normalizePrice(value: number): number {
    return Math.ceil(value / 100) * 100;
  }

  function normalizeDuration(value: number): number {
    return Math.ceil(value / 5) * 5;
  }

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
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  const saveServices = useCallback(async (items: MasterServiceItem[]): Promise<void> => {
    const payloadItems = items.map((item) => ({
      serviceId: item.serviceId,
      isEnabled: item.isEnabled,
      durationOverrideMin: item.isEnabled ? normalizeDuration(item.effectiveDurationMin) : item.durationOverrideMin,
      priceOverride:
        item.canEditPrice && item.isEnabled ? normalizePrice(item.effectivePrice) : undefined,
    }));

    const res = await fetch("/api/master/services", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payloadItems }),
    });
    const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
    if (!res.ok || !json || !json.ok) {
      throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
    }
  }, []);

  useEffect(() => {
    const items = Object.values(servicesDraft);
    if (items.length === 0) return;

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    const hasInvalidEnabled = items.some(
      (item) =>
        item.isEnabled &&
        (item.effectiveDurationMin <= 0 || (item.canEditPrice && item.effectivePrice <= 0))
    );
    if (hasInvalidEnabled) return;

    if (serviceAutosaveTimer.current) {
      window.clearTimeout(serviceAutosaveTimer.current);
    }

    setAutosaveInfo("Сохраняем...");
    serviceAutosaveTimer.current = window.setTimeout(() => {
      void saveServices(items)
        .then(() => {
          setAutosaveInfo("Сохранено автоматически");
        })
        .catch((saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить услуги");
          setAutosaveInfo(null);
        });
    }, 700);

    return () => {
      if (serviceAutosaveTimer.current) {
        window.clearTimeout(serviceAutosaveTimer.current);
      }
    };
  }, [saveServices, servicesDraft]);

  const createSoloService = async (): Promise<void> => {
    if (!data?.master.isSolo) return;
    if (!newSoloServiceTitle.trim() || newSoloServiceDuration <= 0 || newSoloServicePrice < 0) return;
    const normalizedPrice = normalizePrice(newSoloServicePrice);
    const normalizedDuration = normalizeDuration(newSoloServiceDuration);
    setNewSoloServicePrice(normalizedPrice);
    setNewSoloServiceDuration(normalizedDuration);

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSoloServiceTitle.trim(),
          price: normalizedPrice,
          durationMin: normalizedDuration,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      setNewSoloServiceTitle("");
      setNewSoloServicePrice(0);
      setNewSoloServiceDuration(60);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить услугу");
    } finally {
      setSaving(false);
    }
  };

  const addStudioService = (): void => {
    if (!selectedStudioServiceId) return;
    setServicesDraft((current) => {
      const next = current[selectedStudioServiceId];
      if (!next) return current;
      return {
        ...current,
        [selectedStudioServiceId]: { ...next, isEnabled: true },
      };
    });
    setSelectedStudioServiceId("");
    setShowAddServicePanel(false);
  };

  const openAvatarFileDialog = () => {
    avatarInputRef.current?.click();
  };

  const onAvatarFileSelected = async (file: File | null): Promise<void> => {
    if (!file || !data) return;
    setSaving(true);
    setError(null);
    try {
      const asset = await uploadMasterMedia({
        file,
        masterId: data.master.id,
        kind: "AVATAR",
        replaceAssetId: avatarAssetId ?? undefined,
      });
      setAvatarAssetId(asset.id);
      setAvatarUrl(asset.url);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить аватар");
    } finally {
      setSaving(false);
    }
  };

  const deleteAvatar = async (): Promise<void> => {
    if (!avatarAssetId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${avatarAssetId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setAvatarAssetId(null);
      setAvatarUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить аватар");
    } finally {
      setSaving(false);
    }
  };

  const uploadPortfolioFile = async (file: File): Promise<void> => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const asset = await uploadMasterMedia({
        file,
        masterId: data.master.id,
        kind: "PORTFOLIO",
      });
      setPendingPortfolioMeta({ assetId: asset.id, mediaUrl: asset.url });
      setPortfolioCaption("");
      setPortfolioServiceIds([]);
      setPortfolioMetaOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setSaving(false);
    }
  };

  const commitPendingPortfolio = async (): Promise<void> => {
    if (!pendingPortfolioMeta) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/master/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: toAbsoluteMediaUrl(pendingPortfolioMeta.mediaUrl),
          caption: portfolioCaption.trim() || undefined,
          serviceIds: portfolioServiceIds,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(extractApiErrorMessage(json && !json.ok ? json : null, "Не удалось сохранить описание фото"));
      }
      setPendingPortfolioMeta(null);
      setPortfolioMetaOpen(false);
      setPortfolioCaption("");
      setPortfolioServiceIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить описание фото");
    } finally {
      setSaving(false);
    }
  };

  const removePortfolio = async (item: PortfolioItem): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/portfolio/${item.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      const assetId = portfolioAssetIdsByUrl[item.mediaUrl] ?? parseMediaAssetId(item.mediaUrl);
      if (assetId) {
        await fetch(`/api/media/${assetId}`, { method: "DELETE" });
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить фото из портфолио");
    } finally {
      setSaving(false);
    }
  };

  const replacePortfolio = async (item: PortfolioItem, file: File): Promise<void> => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const asset = await uploadMasterMedia({
        file,
        masterId: data.master.id,
        kind: "PORTFOLIO",
      });

      const createRes = await fetch("/api/master/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: toAbsoluteMediaUrl(asset.url),
          caption: item.caption ?? undefined,
          serviceIds: item.serviceIds,
        }),
      });
      const createJson = (await createRes.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | ApiErrorShape
        | null;
      if (!createRes.ok || !createJson || !createJson.ok) {
        throw new Error(
          extractApiErrorMessage(
            createJson && !createJson.ok ? createJson : null,
            "Не удалось заменить фото"
          )
        );
      }

      await removePortfolio(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось заменить фото");
      setSaving(false);
    }
  };

  if (loading || !data) {
    return <div className="rounded-2xl border p-5 text-sm">Загрузка профиля...</div>;
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border p-4">
          <h3 className="text-sm font-semibold">Профиль и витрина</h3>
          <div className="mt-3 space-y-3">
            <div className="relative h-24 w-24 rounded-2xl border bg-neutral-100">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="h-full w-full rounded-2xl object-cover" /> : null}
              <div className="absolute right-1 top-1 flex gap-1">
                <button type="button" onClick={openAvatarFileDialog} className="rounded-md bg-black/60 px-1.5 py-1 text-xs text-white" aria-label="Заменить аватар">
                  ✏️
                </button>
                {avatarAssetId ? (
                  <button type="button" onClick={() => void deleteAvatar()} className="rounded-md bg-black/60 px-1.5 py-1 text-xs text-white" aria-label="Удалить аватар">
                    ✖️
                  </button>
                ) : null}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file) {
                    void onAvatarFileSelected(file);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </div>

            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Имя" />
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Тэглайн" />
            <textarea className="w-full rounded-lg border px-3 py-2 text-sm" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="О себе" />
            <button type="button" onClick={() => void saveProfile()} disabled={saving} className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60">
              {saving ? "Сохраняем..." : "Сохранить профиль"}
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
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Мои услуги</h3>
          <button
            type="button"
            onClick={() => setShowAddServicePanel((value) => !value)}
            className="rounded-lg border px-2 py-1 text-sm"
            aria-label="Добавить услугу"
          >
            +
          </button>
        </div>
        {autosaveInfo ? <div className="mt-1 text-xs text-neutral-500">{autosaveInfo}</div> : null}

        {showAddServicePanel ? (
          <div className="mt-3 rounded-xl border p-3">
            {data.master.isSolo ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  type="text"
                  value={newSoloServiceTitle}
                  onChange={(event) => setNewSoloServiceTitle(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="Название"
                />
                <input
                  type="number"
                  min={0}
                  value={newSoloServicePrice}
                  onChange={(event) => setNewSoloServicePrice(Number(event.target.value) || 0)}
                  onBlur={() => setNewSoloServicePrice((value) => (value > 0 ? normalizePrice(value) : value))}
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="Цена (₽)"
                />
                <input
                  type="number"
                  min={1}
                  value={newSoloServiceDuration}
                  onChange={(event) => setNewSoloServiceDuration(Number(event.target.value) || 0)}
                  onBlur={() =>
                    setNewSoloServiceDuration((value) => (value > 0 ? normalizeDuration(value) : value))
                  }
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="Длительность (мин)"
                />
                <button type="button" onClick={() => void createSoloService()} disabled={saving} className="rounded border px-2 py-1 text-sm">
                  Добавить
                </button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedStudioServiceId}
                  onChange={(event) => setSelectedStudioServiceId(event.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="">Выберите услугу из каталога студии</option>
                  {disabledServices.map((service) => (
                    <option key={service.serviceId} value={service.serviceId}>
                      {service.title}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addStudioService} className="rounded border px-2 py-1 text-sm">
                  Добавить
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 border-b bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600">
            <div>Название</div>
            <div>Цена</div>
            <div>Продолжительность</div>
            <div>Включено</div>
          </div>
          {serviceList.map((service) => (
            <div key={service.serviceId} className="border-b px-3 py-2 last:border-b-0">
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-start">
                <div className="pt-1 text-sm">{service.title}</div>
                <div>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={service.effectivePrice}
                    disabled={!service.canEditPrice}
                    placeholder="Цена (₽)"
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: {
                          ...current[service.serviceId],
                          effectivePrice: Number.isFinite(raw) ? raw : 0,
                          priceOverride: Number.isFinite(raw) ? raw : null,
                        },
                      }));
                      setServiceFieldErrors((current) => ({
                        ...current,
                        [service.serviceId]: { ...current[service.serviceId], price: undefined },
                      }));
                    }}
                    onBlur={() => {
                      if (!service.canEditPrice) return;
                      const currentValue = servicesDraft[service.serviceId]?.effectivePrice ?? 0;
                      if (!Number.isFinite(currentValue) || currentValue <= 0) {
                        setServiceFieldErrors((current) => ({
                          ...current,
                          [service.serviceId]: { ...current[service.serviceId], price: "Введите цену больше 0." },
                        }));
                        return;
                      }
                      const normalized = normalizePrice(currentValue);
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: {
                          ...current[service.serviceId],
                          effectivePrice: normalized,
                          priceOverride: normalized,
                        },
                      }));
                    }}
                  />
                  {serviceFieldErrors[service.serviceId]?.price ? (
                    <div className="mt-1 text-xs text-red-600">{serviceFieldErrors[service.serviceId]?.price}</div>
                  ) : null}
                </div>
                <div>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={service.effectiveDurationMin}
                    placeholder="Длительность (мин)"
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: {
                          ...current[service.serviceId],
                          effectiveDurationMin: Number.isFinite(raw) ? raw : 0,
                          durationOverrideMin: Number.isFinite(raw) ? raw : null,
                        },
                      }));
                      setServiceFieldErrors((current) => ({
                        ...current,
                        [service.serviceId]: { ...current[service.serviceId], duration: undefined },
                      }));
                    }}
                    onBlur={() => {
                      const currentValue = servicesDraft[service.serviceId]?.effectiveDurationMin ?? 0;
                      if (!Number.isFinite(currentValue) || currentValue <= 0) {
                        setServiceFieldErrors((current) => ({
                          ...current,
                          [service.serviceId]: { ...current[service.serviceId], duration: "Введите длительность больше 0." },
                        }));
                        return;
                      }
                      const normalized = normalizeDuration(currentValue);
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: {
                          ...current[service.serviceId],
                          effectiveDurationMin: normalized,
                          durationOverrideMin: normalized,
                        },
                      }));
                    }}
                  />
                  {serviceFieldErrors[service.serviceId]?.duration ? (
                    <div className="mt-1 text-xs text-red-600">{serviceFieldErrors[service.serviceId]?.duration}</div>
                  ) : null}
                </div>
                <label className="pt-1 text-xs">
                  <input
                    type="checkbox"
                    checked={service.isEnabled}
                    onChange={(event) =>
                      setServicesDraft((current) => ({
                        ...current,
                        [service.serviceId]: { ...current[service.serviceId], isEnabled: event.target.checked },
                      }))
                    }
                  />
                </label>
              </div>
              {!service.canEditPrice ? (
                <div className="mt-1 text-xs text-neutral-500">Цена управляется студией, доступен только тайминг.</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Портфолио</h3>

        <div className="mt-3">
          <input
            ref={newPortfolioInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) {
                void uploadPortfolioFile(file);
                event.currentTarget.value = "";
              }
            }}
          />
          <button type="button" onClick={() => newPortfolioInputRef.current?.click()} className="rounded-lg border px-3 py-2 text-sm">
            + Добавить фото
          </button>
        </div>

        {pendingPortfolioMeta ? (
          <div className="mt-3 rounded-xl border p-3">
            <img src={pendingPortfolioMeta.mediaUrl} alt="pending" className="h-40 w-full rounded-lg object-cover" />
            <button type="button" onClick={() => setPortfolioMetaOpen(true)} className="mt-2 rounded border px-2 py-1 text-xs">
              Описание
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.portfolio.map((item) => (
            <div key={item.id} className="relative rounded-xl border p-2">
              <img src={item.mediaUrl} alt="portfolio" className="h-40 w-full rounded-lg object-cover" />
              <div className="absolute right-3 top-3 flex gap-1">
                <label className="cursor-pointer rounded-md bg-black/60 px-1.5 py-1 text-xs text-white" title="Заменить">
                  ✏️
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file) {
                        void replacePortfolio(item, file);
                        event.currentTarget.value = "";
                      }
                    }}
                  />
                </label>
                <button type="button" onClick={() => void removePortfolio(item)} className="rounded-md bg-black/60 px-1.5 py-1 text-xs text-white" title="Удалить">
                  ✖️
                </button>
              </div>
              {item.caption ? <div className="mt-1 text-xs text-neutral-600">{item.caption}</div> : null}
              <div className="mt-1 text-[11px] text-neutral-500">Услуг: {item.serviceIds.length}</div>
            </div>
          ))}
        </div>
      </div>

      {portfolioMetaOpen && pendingPortfolioMeta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-4">
            <h3 className="text-base font-semibold">Описание фото</h3>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={portfolioCaption}
                onChange={(event) => setPortfolioCaption(event.target.value)}
                placeholder="Подпись (необязательно)"
              />
              <div className="rounded-lg border p-2">
                <div className="mb-1 text-xs text-neutral-600">Какая это услуга? (необязательно)</div>
                <div className="flex flex-wrap gap-2">
                  {serviceList.map((service) => (
                    <label key={`portfolio-${service.serviceId}`} className="text-xs">
                      <input
                        type="checkbox"
                        checked={portfolioServiceIds.includes(service.serviceId)}
                        onChange={(event) =>
                          setPortfolioServiceIds((current) =>
                            event.target.checked
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
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPortfolioMetaOpen(false)} className="rounded-lg border px-3 py-2 text-sm">
                Закрыть
              </button>
              <button type="button" onClick={() => void commitPendingPortfolio()} disabled={saving} className="rounded-lg bg-black px-3 py-2 text-sm text-white">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
