"use client";

/* eslint-disable @next/next/no-img-element */
import { MediaEntityType } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploaderSurface } from "@/components/ui/uploader-surface";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

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
  const t = UI_TEXT.studioCabinet.profile;
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
        throw new Error(
          studioJson && !studioJson.ok
            ? studioJson.error.message
            : `${t.apiErrorPrefix}: ${studioRes.status}`
        );
      }

      const mediaJson = (await mediaRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (!mediaRes.ok || !mediaJson || !mediaJson.ok) {
        throw new Error(
          mediaJson && !mediaJson.ok
            ? mediaJson.error.message
            : `${t.apiErrorPrefix}: ${mediaRes.status}`
        );
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
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [providerId, t.apiErrorPrefix, t.loadFailed]);

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
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setInfo(t.profileSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
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
        throw new Error(json && !json.ok ? json.error.message : `${t.apiErrorPrefix}: ${res.status}`);
      }
      setBannerAssetId(json.data.studio.bannerAssetId);
      setBannerUrl(json.data.studio.bannerUrl);
      setInfo(t.bannerSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveBannerFailed);
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
        throw new Error(
          uploadJson && !uploadJson.ok
            ? uploadJson.error.message
            : `${t.apiErrorPrefix}: ${uploadRes.status}`
        );
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
        throw new Error(
          saveJson && !saveJson.ok
            ? saveJson.error.message
            : `${t.apiErrorPrefix}: ${saveRes.status}`
        );
      }
      setBannerAssetId(saveJson.data.studio.bannerAssetId);
      setBannerUrl(saveJson.data.studio.bannerUrl);
      setInfo(t.bannerUploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.uploadBannerFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {info ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{info}</div> : null}

      <PublicUsernameCard endpoint="/api/cabinet/studio/public-username" />

      <section className="lux-card rounded-[24px] p-4">
        <h3 className="text-sm font-semibold">{t.sectionTitle}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.namePlaceholder} />
          <Input value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder={t.taglinePlaceholder} />
          <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t.addressPlaceholder} />
          <Input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder={t.districtPlaceholder} />
          <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder={t.contactNamePlaceholder} />
          <Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder={t.contactPhonePlaceholder} />
          <Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder={t.contactEmailPlaceholder} />
          <Input
            value={categoriesRaw}
            onChange={(event) => setCategoriesRaw(event.target.value)}
            placeholder={t.categoriesPlaceholder}
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.descriptionPlaceholder}
            className="md:col-span-2"
          />
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />
          {t.published}
        </label>
        <div className="mt-3">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t.saving : t.saveProfile}
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <UploaderSurface
          title={t.avatarTitle}
          description={t.avatarHint}
          preview={
            <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border-subtle bg-bg-input/50 p-4">
              <AvatarEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit sizeClassName="h-28 w-28" />
            </div>
          }
        />

        <UploaderSurface
          title={t.bannerTitle}
          description={t.bannerHint}
          preview={
            <div className="min-h-[220px] rounded-xl border border-border-subtle bg-bg-input/50 p-3">
              <div className="aspect-[16/6] overflow-hidden rounded-lg border border-border-subtle bg-bg-input">
                {selectedBannerUrl ? (
                  <img src={selectedBannerUrl} alt={t.studioBannerAlt} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-text-sec">{t.noBanner}</div>
                )}
              </div>
            </div>
          }
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => bannerInputRef.current?.click()}
                disabled={saving}
                size="sm"
              >
                {t.uploadBanner}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void saveBanner(null)}
                disabled={saving || !bannerAssetId}
                size="sm"
              >
                {t.clearBanner}
              </Button>
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
            </>
          }
          gallery={
            portfolioAssets.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {portfolioAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void saveBanner(asset.id)}
                    className={`relative overflow-hidden rounded-lg border ${
                      bannerAssetId === asset.id ? "border-primary ring-1 ring-primary" : "border-border-subtle"
                    }`}
                    aria-label={t.useAsBannerAria}
                  >
                    <img src={asset.url} alt="" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null
          }
        />

      </div>

      <section className="lux-card rounded-[24px] p-4">
        <h3 className="text-sm font-semibold">{t.portfolioTitle}</h3>
        <div className="mt-3">
          <PortfolioEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit />
        </div>
      </section>
    </div>
  );
}
