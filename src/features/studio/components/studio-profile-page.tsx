"use client";

/* eslint-disable @next/next/no-img-element */
import { MediaEntityType } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ApiResponse } from "@/lib/types/api";

type StudioProfileData = {
  studio: {
    id: string;
    name: string;
    tagline: string;
    address: string;
    district: string;
    categories: string[];
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    description: string | null;
    avatarUrl: string | null;
    isPublished: boolean;
    bannerAssetId: string | null;
    bannerUrl: string | null;
  };
};

type Props = {
  providerId: string;
};

export function StudioProfilePage({ providerId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [categoriesRaw, setCategoriesRaw] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const [bannerAssetId, setBannerAssetId] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [portfolioAssets, setPortfolioAssets] = useState<MediaAssetDto[]>([]);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [studioRes, mediaRes] = await Promise.all([
        fetch(`/api/studios/${providerId}`, { cache: "no-store" }),
        fetch(`/api/media?entityType=STUDIO&entityId=${encodeURIComponent(providerId)}&kind=PORTFOLIO`, {
          cache: "no-store",
        }),
      ]);

      const studioJson = (await studioRes.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!studioRes.ok || !studioJson || !studioJson.ok) {
        throw new Error(studioJson && !studioJson.ok ? studioJson.error.message : `API error: ${studioRes.status}`);
      }

      const mediaJson = (await mediaRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (!mediaRes.ok || !mediaJson || !mediaJson.ok) {
        throw new Error(mediaJson && !mediaJson.ok ? mediaJson.error.message : `API error: ${mediaRes.status}`);
      }

      const studio = studioJson.data.studio;
      setName(studio.name);
      setTagline(studio.tagline);
      setDescription(studio.description ?? "");
      setAddress(studio.address);
      setDistrict(studio.district);
      setCategoriesRaw(studio.categories.join(", "));
      setContactName(studio.contactName ?? "");
      setContactPhone(studio.contactPhone ?? "");
      setContactEmail(studio.contactEmail ?? "");
      setIsPublished(studio.isPublished);
      setBannerAssetId(studio.bannerAssetId);
      setBannerUrl(studio.bannerUrl);
      setPortfolioAssets(mediaJson.data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load studio profile");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedCategories = useMemo(() => {
    return Array.from(
      new Set(
        categoriesRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }, [categoriesRaw]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tagline: tagline.trim(),
          description: description.trim() || null,
          address: address.trim(),
          district: district.trim(),
          categories: parsedCategories,
          contactName: contactName.trim() || null,
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
          isPublished,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setInfo("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save studio profile");
    } finally {
      setSaving(false);
    }
  };

  const saveBanner = async (assetId: string | null): Promise<void> => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: assetId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setBannerAssetId(json.data.studio.bannerAssetId);
      setBannerUrl(json.data.studio.bannerUrl);
      setInfo("Banner saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save banner");
    } finally {
      setSaving(false);
    }
  };

  const selectedBannerUrl = useMemo(() => {
    if (bannerAssetId) {
      return portfolioAssets.find((asset) => asset.id === bannerAssetId)?.url ?? bannerUrl;
    }
    return bannerUrl;
  }, [bannerAssetId, bannerUrl, portfolioAssets]);

  const uploadBanner = async (file: File): Promise<void> => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "STUDIO");
      formData.set("entityId", providerId);
      formData.set("kind", "PORTFOLIO");

      const uploadRes = await fetch("/api/media", { method: "POST", body: formData });
      const uploadJson = (await uploadRes.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
      if (!uploadRes.ok || !uploadJson || !uploadJson.ok) {
        throw new Error(uploadJson && !uploadJson.ok ? uploadJson.error.message : `API error: ${uploadRes.status}`);
      }

      const uploaded = uploadJson.data.asset;
      setPortfolioAssets((current) => [uploaded, ...current.filter((asset) => asset.id !== uploaded.id)]);

      const saveRes = await fetch(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: uploaded.id }),
      });
      const saveJson = (await saveRes.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!saveRes.ok || !saveJson || !saveJson.ok) {
        throw new Error(saveJson && !saveJson.ok ? saveJson.error.message : `API error: ${saveRes.status}`);
      }
      setBannerAssetId(saveJson.data.studio.bannerAssetId);
      setBannerUrl(saveJson.data.studio.bannerUrl);
      setInfo("Banner uploaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload banner");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm">Loading studio profile...</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{info}</div> : null}

      <section className="rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Studio profile</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Tagline" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="District" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Contact name" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Contact phone" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Contact email" className="rounded-lg border px-3 py-2 text-sm" />
          <input
            value={categoriesRaw}
            onChange={(event) => setCategoriesRaw(event.target.value)}
            placeholder="Categories (comma separated)"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="md:col-span-2 min-h-[110px] rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />
          Published
        </label>
        <div className="mt-3">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border p-4">
          <h3 className="text-sm font-semibold">Avatar</h3>
          <p className="mt-1 text-xs text-neutral-500">Main studio avatar for listings and profile.</p>
          <div className="mt-3 flex min-h-[220px] items-center justify-center rounded-xl border bg-neutral-50/50 p-4">
            <AvatarEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit sizeClassName="h-28 w-28" />
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h3 className="text-sm font-semibold">Banner</h3>
          <p className="mt-1 text-xs text-neutral-500">Wide cover for your public studio page.</p>
          <div className="mt-3 min-h-[220px] rounded-xl border bg-neutral-50/50 p-3">
            <div className="aspect-[16/6] overflow-hidden rounded-lg border bg-neutral-200">
              {selectedBannerUrl ? (
                <img src={selectedBannerUrl} alt="Studio banner" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-neutral-500">No banner selected</div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={saving}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
              >
                Upload banner
              </button>
              <button
                type="button"
                onClick={() => void saveBanner(null)}
                disabled={saving || !bannerAssetId}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
              >
                Clear banner
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file) {
                    void uploadBanner(file);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </div>

            {portfolioAssets.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {portfolioAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void saveBanner(asset.id)}
                    className={`relative overflow-hidden rounded-lg border ${
                      bannerAssetId === asset.id ? "border-black ring-1 ring-black" : "border-neutral-300"
                    }`}
                    aria-label="Use image as banner"
                  >
                    <img src={asset.url} alt="" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border p-4">
        <h3 className="text-sm font-semibold">Portfolio</h3>
        <div className="mt-3">
          <PortfolioEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit />
        </div>
      </section>
    </div>
  );
}
