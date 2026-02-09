"use client";

import { MediaEntityType } from "@prisma/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { StudioProfileHero } from "@/features/studio-cabinet/components/studio-profile-hero";
import { StudioProfileForm } from "@/features/studio-cabinet/components/studio-profile-form";
import { StickySaveBar } from "@/features/studio-cabinet/components/sticky-save-bar";

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

type AddressSuggestResponse = {
  suggestions: string[];
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
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [vk, setVk] = useState("");

  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressSuggestLoading, setAddressSuggestLoading] = useState(false);
  const [addressSuggestFocused, setAddressSuggestFocused] = useState(false);

  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);
  const addressSuggestAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const studioRes = await fetch(`/api/studios/${providerId}`, { cache: "no-store" });
      const studioJson = (await studioRes.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!studioRes.ok || !studioJson || !studioJson.ok) {
        throw new Error(
          studioJson && !studioJson.ok
            ? studioJson.error.message
            : `${t.apiErrorPrefix}: ${studioRes.status}`
        );
      }

      const studio = studioJson.data.studio;
      setName(studio.name);
      setTagline(studio.tagline);
      setDescription(studio.description ?? "");
      setAddress(studio.address);
      setDistrict(studio.district);
      setContactName(studio.contactName ?? "");
      setContactPhone(studio.contactPhone ?? "");
      setContactEmail(studio.contactEmail ?? "");
      setIsPublished(studio.isPublished);
      setBannerUrl(studio.bannerUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [providerId, t.apiErrorPrefix, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!addressSuggestRootRef.current) return;
      if (addressSuggestRootRef.current.contains(event.target as Node)) return;
      setAddressSuggestFocused(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      if (addressSuggestAbortRef.current) {
        addressSuggestAbortRef.current.abort();
        addressSuggestAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!addressSuggestFocused) {
      setAddressSuggestLoading(false);
      return;
    }

    const query = address.trim();
    if (query.length < 3) {
      if (addressSuggestAbortRef.current) {
        addressSuggestAbortRef.current.abort();
        addressSuggestAbortRef.current = null;
      }
      setAddressSuggestions([]);
      setAddressSuggestLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      if (addressSuggestAbortRef.current) {
        addressSuggestAbortRef.current.abort();
      }
      addressSuggestAbortRef.current = controller;
      setAddressSuggestLoading(true);

      void (async () => {
        try {
          const params = new URLSearchParams({ q: query, limit: "6" });
          const res = await fetch(`/api/address/suggest?${params.toString()}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => null)) as ApiResponse<AddressSuggestResponse> | null;
          if (!res.ok || !json || !json.ok) {
            setAddressSuggestions([]);
            return;
          }
          setAddressSuggestions(json.data.suggestions);
        } catch (suggestError) {
          if (suggestError instanceof DOMException && suggestError.name === "AbortError") return;
          setAddressSuggestions([]);
        } finally {
          if (!controller.signal.aborted) {
            setAddressSuggestLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [address, addressSuggestFocused]);

  const resizeDescription = useCallback(() => {
    if (!descriptionRef.current) return;
    descriptionRef.current.style.height = "auto";
    descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeDescription();
  }, [description, resizeDescription]);

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
      const uploadJson = (await uploadRes.json().catch(() => null)) as ApiResponse<{ asset: { id: string } }> | null;
      if (!uploadRes.ok || !uploadJson || !uploadJson.ok) {
        throw new Error(
          uploadJson && !uploadJson.ok
            ? uploadJson.error.message
            : `${t.apiErrorPrefix}: ${uploadRes.status}`
        );
      }

      const saveRes = await fetch(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: uploadJson.data.asset.id }),
      });
      const saveJson = (await saveRes.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!saveRes.ok || !saveJson || !saveJson.ok) {
        throw new Error(
          saveJson && !saveJson.ok
            ? saveJson.error.message
            : `${t.apiErrorPrefix}: ${saveRes.status}`
        );
      }
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

  const avatarNode = (
    <div className="group relative h-[96px] w-[96px] overflow-hidden rounded-[22px] border border-border-subtle bg-bg-input">
      <AvatarEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit sizeClassName="h-[96px] w-[96px]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        Загрузить
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {info}
        </div>
      ) : null}

      <StudioProfileHero
        bannerUrl={bannerUrl}
        avatar={avatarNode}
        title={name || "Студия"}
        description={description}
        onEditBanner={() => bannerInputRef.current?.click()}
      />

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <PublicUsernameCard endpoint="/api/cabinet/studio/public-username" />
        <div className="rounded-2xl bg-bg-card/90 p-4">
          <h3 className="text-sm font-semibold">Публикация профиля</h3>
          <p className="mt-1 text-xs text-text-sec">
            Без публикации профиль не отображается в поиске и витрине.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
            />
            Опубликовать профиль
          </label>
        </div>
      </div>

      <StudioProfileForm
        name={name}
        description={description}
        address={address}
        phone={contactPhone}
        email={contactEmail}
        telegram={telegram}
        instagram={instagram}
        vk={vk}
        addressSuggestions={addressSuggestions}
        addressSuggestLoading={addressSuggestLoading}
        addressSuggestFocused={addressSuggestFocused}
        addressSuggestRootRef={addressSuggestRootRef}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onDescriptionInput={() => {
          resizeDescription();
        }}
        descriptionRef={descriptionRef}
        onAddressChange={setAddress}
        onAddressFocus={() => setAddressSuggestFocused(true)}
        onAddressSuggestionSelect={(value) => {
          setAddress(value);
          setAddressSuggestFocused(false);
        }}
        onPhoneChange={setContactPhone}
        onEmailChange={setContactEmail}
        onTelegramChange={setTelegram}
        onInstagramChange={setInstagram}
        onVkChange={setVk}
      />

      <StickySaveBar onSave={() => void save()} loading={saving} disabled={saving} />
      <div id="reviews" />
    </div>
  );
}
