"use client";

import { MediaEntityType } from "@/lib/prisma-enums";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { CropPicker } from "@/features/media/components/crop-picker";
import { StickySaveBar } from "@/features/studio-cabinet/components/sticky-save-bar";
import { StudioProfileForm } from "@/features/studio-cabinet/components/studio-profile-form";
import { StudioProfileHero } from "@/features/studio-cabinet/components/studio-profile-hero";
import { useAddressWithGeocode } from "@/lib/maps/use-address-with-geocode";
import type { CropArea } from "@/lib/media/crop-geometry";
import { buildMediaDisplayUrl } from "@/lib/media/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { SOCIAL_FIELD, SOCIAL_KINDS, type SocialKind } from "@/lib/providers/social-links";
import * as UI_TEXT from "@/lib/ui/text";
import { FileInput } from "@/components/ui/file-input";

/**
 * LEGACY-STUDIO-SETTINGS-PORT-AND-RETIRE — the studio profile + media
 * editor, ported verbatim (behaviorally-neutral) from the old
 * `features/studio/components/studio-settings-page.tsx` "main" tab, which
 * was reachable only via the now-deleted orphan `settings/profile` route.
 *
 * Reuses `StudioProfileHero` (banner + avatar + published toggle) +
 * `StudioProfileForm` (name / description / address+geocode / contacts) —
 * same fields, same `PATCH /api/studios/[id]` save, same banner-upload
 * flow. No new endpoint.
 *
 * 🔴 The `id` in `/api/studios/[id]` is the **Provider** id (the route does
 * `provider.findUnique({ where: { id }, type: STUDIO })`) — NOT the Studio
 * id. We pass `providerId` here. (The sibling `GeneralForm`/`ArchiveToggle`
 * had been PATCHing `studioId` → 404; fixed alongside this port.)
 *
 * FEAT-PROVIDER-SOCIALS: VK / Instagram / Telegram / MAX are real free-text
 * community links — loaded from + saved to `Provider.social{Vk,Instagram,
 * Telegram,Max}` via the same `PATCH /api/studios/[id]`. Normalized +
 * host/scheme-validated server-side; a live preview mirrors the normalizer
 * under each input. SOCIAL-TG-MAX: поле Telegram — ссылка на канал студии, а
 * не прежний «контакт в Telegram» (его убрал FIX-STUDIO-SOCIAL-PERSIST):
 * килсвитч FZ-199 гасит вход и доставку, ссылку на канал он не касается.
 */

type StudioProfileData = {
  studio: {
    id: string;
    name: string;
    tagline: string;
    address: string;
    geoLat: number | null;
    geoLng: number | null;
    district: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    timezone: string;
    socialVk: string | null;
    socialInstagram: string | null;
    socialTelegram: string | null;
    socialMax: string | null;
    description: string | null;
    avatarUrl: string | null;
    isPublished: boolean;
    bannerAssetId: string | null;
    bannerUrl: string | null;
    bannerDisplayUrl: string | null;
    bannerCrop: CropArea | null;
  };
};

type Props = {
  providerId: string;
  studioId: string;
};

const EMPTY_SOCIALS: Record<SocialKind, string> = { vk: "", instagram: "", telegram: "", max: "" };

export function ProfileMediaEditor({ providerId }: Props) {
  const t = UI_TEXT.studio.profilePage;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  // FIX-STUDIO-SETTINGS-MERGE: слоган переехал сюда из удалённой вкладки «Общее».
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  // FEAT-PROVIDER-SOCIALS: free-text community links, persisted.
  const [socials, setSocials] = useState<Record<SocialKind, string>>(EMPTY_SOCIALS);
  const setSocial = useCallback((kind: SocialKind, value: string) => {
    setSocials((prev) => ({ ...prev, [kind]: value }));
  }, []);
  // FIX-STUDIO-TZ-FROM-ADDRESS: read-only — сервер выводит зону из города адреса.
  const [timezone, setTimezone] = useState<string | null>(null);

  // UX-PASS-01: свой ref поля адреса — при неподтверждённом адресе фокус
  // возвращается в поле (ref хука — заглушка).
  const addressFieldRef = useRef<HTMLInputElement | null>(null);
  // Адрес, сохранённый на сервере: неподтверждённым считается только ИЗМЕНЁННЫЙ
  // текст — старый адрес без координат не блокирует сохранение остальных полей.
  const persistedAddressRef = useRef("");
  const {
    addressText,
    addressCoords,
    addressStatus,
    suggestions: addressSuggestions,
    isSuggestOpen: isAddressSuggestOpen,
    setIsSuggestOpen: setIsAddressSuggestOpen,
    selectSuggestion: selectAddressSuggestion,
    activeIndex: addressSuggestIndex,
    setActiveIndex: setAddressSuggestIndex,
    setAddressSnapshot,
    handleAddressChange,
  } = useAddressWithGeocode();

  // PORTFOLIO-CROP-01: исходник — редактору обрезки, вырез — шапке кабинета.
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerDisplayUrl, setBannerDisplayUrl] = useState<string | null>(null);
  const [bannerCrop, setBannerCrop] = useState<CropArea | null>(null);
  const [bannerAssetId, setBannerAssetId] = useState<string | null>(null);
  const [pickingBannerFocal, setPickingBannerFocal] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const savedTimeoutRef = useRef<number | null>(null);

  const applyBanner = useCallback((studio: StudioProfileData["studio"]) => {
    setBannerUrl(studio.bannerUrl);
    setBannerDisplayUrl(studio.bannerDisplayUrl ?? studio.bannerUrl);
    setBannerCrop(studio.bannerCrop ?? null);
    setBannerAssetId(studio.bannerAssetId ?? null);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // UI-17: без серверной строки — курируемая `loadFailed`, а не «Ошибка
      // API: 500» (решает `serverMessageOr` в `catch` ниже).
      const loaded = await fetchJsonWithAuth<StudioProfileData>(`/api/studios/${providerId}`, {
        cache: "no-store",
      });
      const studio = loaded.studio;
      setName(studio.name);
      setTagline(studio.tagline ?? "");
      setDescription(studio.description ?? "");
      const coords =
        typeof studio.geoLat === "number" &&
        Number.isFinite(studio.geoLat) &&
        typeof studio.geoLng === "number" &&
        Number.isFinite(studio.geoLng)
          ? { lat: studio.geoLat, lng: studio.geoLng }
          : null;
      setAddressSnapshot({ text: studio.address, coords });
      persistedAddressRef.current = studio.address;
      setContactName(studio.contactName ?? "");
      setContactPhone(studio.contactPhone ?? "");
      setContactEmail(studio.contactEmail ?? "");
      setSocials({
        vk: studio.socialVk ?? "",
        instagram: studio.socialInstagram ?? "",
        telegram: studio.socialTelegram ?? "",
        max: studio.socialMax ?? "",
      });
      setIsPublished(studio.isPublished);
      applyBanner(studio);
      setTimezone(studio.timezone || null);
    } catch (err) {
      setError(serverMessageOr(err, t.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [applyBanner, providerId, setAddressSnapshot, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current !== null) {
        window.clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const markSaved = useCallback(() => {
    setSaved(true);
    if (savedTimeoutRef.current !== null) {
      window.clearTimeout(savedTimeoutRef.current);
    }
    savedTimeoutRef.current = window.setTimeout(() => {
      setSaved(false);
      savedTimeoutRef.current = null;
    }, 2500);
  }, []);

  const save = async (): Promise<void> => {
    const trimmedAddress = addressText.trim();
    const coordsReady =
      !trimmedAddress ||
      (addressCoords && Number.isFinite(addressCoords.lat) && Number.isFinite(addressCoords.lng));
    // UX-PASS-01: новый адрес без координат раньше молча не отправлялся, а
    // кнопка всё равно показывала «Сохранено» — человек уходил со старым
    // адресом на странице. Теперь сохранение останавливается с подсказкой.
    if (
      trimmedAddress &&
      !coordsReady &&
      trimmedAddress !== persistedAddressRef.current.trim()
    ) {
      setError(t.addressNotConfirmed);
      setSaved(false);
      addressFieldRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        tagline: tagline.trim(),
        description: description.trim() || null,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        // FEAT-PROVIDER-SOCIALS: raw input; server normalizes + validates.
        ...Object.fromEntries(
          SOCIAL_KINDS.map((kind) => [SOCIAL_FIELD[kind], socials[kind].trim() || null]),
        ),
        isPublished,
      };

      if (!trimmedAddress) {
        payload.address = "";
        payload.geoLat = null;
        payload.geoLng = null;
      } else if (coordsReady && addressCoords) {
        payload.address = trimmedAddress;
        payload.geoLat = addressCoords.lat;
        payload.geoLng = addressCoords.lng;
      }

      const saved = await fetchJsonWithAuth<StudioProfileData>(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setIsPublished(saved.studio.isPublished);
      persistedAddressRef.current = saved.studio.address;
      // Сервер мог пересчитать зону по новому адресу — показываем результат
      // сразу, а не до следующей загрузки страницы.
      setTimezone(saved.studio.timezone || null);
      markSaved();
    } catch (err) {
      setError(serverMessageOr(err, t.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  const uploadBanner = async (file: File): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "STUDIO");
      formData.set("entityId", providerId);
      formData.set("kind", "PORTFOLIO");

      const uploaded = await fetchJsonWithAuth<{ asset: { id: string } }>("/api/media", {
        method: "POST",
        body: formData,
      });

      const saved = await fetchJsonWithAuth<StudioProfileData>(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: uploaded.asset.id }),
      });
      applyBanner(saved.studio);
      setPickingBannerFocal(true);
      markSaved();
    } catch (err) {
      // Квота хранилища, лимит портфолио, неподходящий файл — дословно.
      setError(serverMessageOr(err, t.uploadBannerFailed));
    } finally {
      setSaving(false);
    }
  };

  const removeBanner = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const saved = await fetchJsonWithAuth<StudioProfileData>(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: null }),
      });
      applyBanner(saved.studio);
      setPickingBannerFocal(false);
      markSaved();
    } catch (err) {
      setError(serverMessageOr(err, t.uploadBannerFailed));
    } finally {
      setSaving(false);
    }
  };

  const canPickBannerFocal = Boolean(bannerAssetId && bannerUrl);

  const avatarNode = useMemo(
    () => (
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-bg-card bg-elevated">
        <AvatarEditor
          entityType={MediaEntityType.STUDIO}
          entityId={providerId}
          canEdit
          showAddButton={false}
          interactionVariant="clickable"
          showRemoveAction
          sizeClassName="h-20 w-20"
        />
      </div>
    ),
    [providerId],
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-danger-text">
          {error}
        </div>
      ) : null}

      {/* SETUP-GUIDE-01: шаг «Профиль студии» подсвечивает шапку. */}
      <div data-guide="profile" className="rounded-2xl">
        <StudioProfileHero
          bannerUrl={bannerDisplayUrl}
          avatar={avatarNode}
          studioName={name}
          subtitle={UI_TEXT.studio.profile.subtitle}
          isPublished={isPublished}
          onTogglePublished={setIsPublished}
          onEditBanner={() => bannerInputRef.current?.click()}
          onRemoveBanner={bannerUrl ? () => void removeBanner() : undefined}
          onEditFocal={bannerUrl ? () => setPickingBannerFocal(true) : undefined}
          isBusy={saving}
        />
      </div>

      <StudioProfileForm
        name={name}
        tagline={tagline}
        description={description}
        address={addressText}
        phone={contactPhone}
        email={contactEmail}
        socials={socials}
        addressInputRef={addressFieldRef}
        addressStatus={addressStatus}
        addressSuggestions={addressSuggestions}
        isAddressSuggestOpen={isAddressSuggestOpen}
        setIsAddressSuggestOpen={setIsAddressSuggestOpen}
        selectAddressSuggestion={selectAddressSuggestion}
        addressSuggestIndex={addressSuggestIndex}
        setAddressSuggestIndex={setAddressSuggestIndex}
        timezone={timezone}
        onNameChange={setName}
        onTaglineChange={setTagline}
        onDescriptionChange={setDescription}
        onAddressChange={handleAddressChange}
        onPhoneChange={setContactPhone}
        onEmailChange={setContactEmail}
        onSocialChange={setSocial}
      />

      <FileInput
        ref={bannerInputRef}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file) {
            void uploadBanner(file);
            event.currentTarget.value = "";
          }
        }}
      />

      {canPickBannerFocal ? (
        <ModalSurface
          open={pickingBannerFocal}
          onClose={() => setPickingBannerFocal(false)}
          title={UI_TEXT.media.crop.titleBanner}
        >
          {/* Окно открывается на сохранённой области; после «Применить»
              меняется только баннер — несохранённые поля формы остаются
              (раньше обрезка перезагружала весь профиль). */}
          <CropPicker
            key={bannerDisplayUrl ?? bannerAssetId}
            assetId={bannerAssetId!}
            imageUrl={bannerUrl!}
            shape="rect"
            aspectRatio={16 / 9}
            initialCropX={bannerCrop?.x}
            initialCropY={bannerCrop?.y}
            initialCropWidth={bannerCrop?.width}
            initialCropHeight={bannerCrop?.height}
            onSave={(cropX, cropY, cropWidth, cropHeight) => {
              const crop = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
              setBannerCrop(crop);
              setBannerDisplayUrl(
                buildMediaDisplayUrl({ id: bannerAssetId!, cropX, cropY, cropWidth, cropHeight }),
              );
              setPickingBannerFocal(false);
            }}
            onSkip={() => setPickingBannerFocal(false)}
          />
        </ModalSurface>
      ) : null}

      <StickySaveBar
        onSave={() => void save()}
        isSaving={saving}
        saved={saved}
        error={error}
        disabled={saving}
      />
    </div>
  );
}
