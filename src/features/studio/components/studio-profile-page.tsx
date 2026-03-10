"use client";

import { MediaEntityType } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { useAddressWithGeocode } from "@/lib/maps/use-address-with-geocode";
import { StudioProfileHero } from "@/features/studio-cabinet/components/studio-profile-hero";
import { StudioProfileForm } from "@/features/studio-cabinet/components/studio-profile-form";
import { StickySaveBar } from "@/features/studio-cabinet/components/sticky-save-bar";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FocalPointPicker } from "@/features/media/components/focal-point-picker";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";

type StudioProfileData = {
  studio: {
    id: string;
    name: string;
    tagline: string;
    address: string;
    geoLat: number | null;
    geoLng: number | null;
    district: string;
    categories: string[];
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    description: string | null;
    avatarUrl: string | null;
    avatarFocalX: number | null;
    avatarFocalY: number | null;
    isPublished: boolean;
    bannerAssetId: string | null;
    bannerUrl: string | null;
    bannerFocalX: number | null;
    bannerFocalY: number | null;
    cancellationDeadlineHours: number | null;
    remindersEnabled: boolean;
  };
};

type Props = {
  providerId: string;
  studioId: string;
};

type StudioServicesResponse = {
  categories: Array<{
    id: string;
    title: string;
    services: Array<{
      id: string;
      title: string;
      basePrice: number;
      baseDurationMin: number;
      isActive: boolean;
    }>;
  }>;
};

type StudioSettingsTab = "notifications" | "features" | "studioSettings";

export function StudioProfilePage({ providerId, studioId }: Props) {
  const t = UI_TEXT.studioCabinet.profile;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteActiveCount, setDeleteActiveCount] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [district, setDistrict] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState<number | null>(null);
  const [cancellationDeadlineInput, setCancellationDeadlineInput] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [settingsTab, setSettingsTab] = useState<StudioSettingsTab>("notifications");
  const [hotSlotServices, setHotSlotServices] = useState<
    Array<{
      serviceId: string;
      title: string;
      isEnabled: boolean;
      effectivePrice: number;
      effectiveDurationMin: number;
    }>
  >([]);

  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [vk, setVk] = useState("");

  const {
    inputRef: addressInputRef,
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

  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerAssetId, setBannerAssetId] = useState<string | null>(null);
  const [bannerFocalX, setBannerFocalX] = useState<number | null>(null);
  const [bannerFocalY, setBannerFocalY] = useState<number | null>(null);
  const [pickingBannerFocal, setPickingBannerFocal] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsTabs = useMemo<TabItem[]>(
    () => [
      { id: "notifications", label: "Уведомления" },
      { id: "features", label: "Функции" },
      { id: "studioSettings", label: "Настройки студии" },
    ],
    []
  );

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
      const coords =
        typeof studio.geoLat === "number" &&
        Number.isFinite(studio.geoLat) &&
        typeof studio.geoLng === "number" &&
        Number.isFinite(studio.geoLng)
          ? { lat: studio.geoLat, lng: studio.geoLng }
          : null;
      setAddressSnapshot({ text: studio.address, coords });
      setDistrict(studio.district);
      setContactName(studio.contactName ?? "");
      setContactPhone(studio.contactPhone ?? "");
      setContactEmail(studio.contactEmail ?? "");
      setIsPublished(studio.isPublished);
      setBannerUrl(studio.bannerUrl);
      setBannerAssetId(studio.bannerAssetId ?? null);
      setBannerFocalX(studio.bannerFocalX ?? null);
      setBannerFocalY(studio.bannerFocalY ?? null);
      const deadlineValue = studio.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
      setRemindersEnabled(studio.remindersEnabled ?? true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [providerId, t.apiErrorPrefix, t.loadFailed, setAddressSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHotSlotServices = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/studio/services?studioId=${encodeURIComponent(studioId)}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<StudioServicesResponse> | null;
      if (!res.ok || !json || !json.ok) {
        setHotSlotServices([]);
        return;
      }

      const mapped = json.data.categories.flatMap((category) =>
        category.services.map((service) => ({
          serviceId: service.id,
          title: service.title,
          isEnabled: service.isActive,
          effectivePrice: service.basePrice,
          effectiveDurationMin: service.baseDurationMin,
        }))
      );
      setHotSlotServices(mapped);
    } catch {
      setHotSlotServices([]);
    }
  }, [studioId]);

  useEffect(() => {
    void loadHotSlotServices();
  }, [loadHotSlotServices]);

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
      const trimmedAddress = addressText.trim();
      const coordsReady =
        !trimmedAddress ||
        (addressCoords &&
          Number.isFinite(addressCoords.lat) &&
          Number.isFinite(addressCoords.lng));
      const payload: Record<string, unknown> = {
        name: name.trim(),
        tagline: tagline.trim(),
        description: description.trim() || null,
        district: district.trim(),
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        isPublished,
        remindersEnabled,
      };

      const trimmedDeadline = cancellationDeadlineInput.trim();
      if (!trimmedDeadline) {
        payload.cancellationDeadlineHours = null;
      } else {
        const parsedDeadline = Number(trimmedDeadline);
        if (!Number.isFinite(parsedDeadline) || parsedDeadline < 0 || parsedDeadline > 168) {
          throw new Error("Укажите значение от 0 до 168.");
        }
        payload.cancellationDeadlineHours = Math.floor(parsedDeadline);
      }

      if (!trimmedAddress) {
        payload.address = "";
        payload.geoLat = null;
        payload.geoLng = null;
      } else if (coordsReady && addressCoords) {
        payload.address = trimmedAddress;
        payload.geoLat = addressCoords.lat;
        payload.geoLng = addressCoords.lng;
      }

      const res = await fetch(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<StudioProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        const errorValue = json && !json.ok ? (json as { error?: unknown }).error : null;
        const message =
          typeof errorValue === "string"
            ? errorValue
            : errorValue &&
                typeof errorValue === "object" &&
                "message" in errorValue &&
                typeof (errorValue as { message?: unknown }).message === "string"
              ? String((errorValue as { message?: unknown }).message)
              : `${t.apiErrorPrefix}: ${res.status}`;
        throw new Error(message);
      }
      setInfo(t.profileSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStudio = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    setDeleteActiveCount(null);
    try {
      const res = await fetch("/api/cabinet/studio/delete", { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ deleted: boolean }>
        | { ok: false; error: { message: string; code?: string; details?: unknown } }
        | null;
      if (!res.ok || !json || !json.ok) {
        const code = json && !json.ok ? json.error.code : null;
        if (code === "ACTIVE_BOOKINGS") {
          const details = json && !json.ok ? (json.error.details as { count?: number } | undefined) : undefined;
          setDeleteActiveCount(typeof details?.count === "number" ? details.count : 0);
        } else {
          setDeleteError(json && !json.ok ? json.error.message : `Ошибка: ${res.status}`);
        }
        return;
      }
      setDeleteModalOpen(false);
      router.push("/cabinet/roles");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Не удалось удалить кабинет студии.");
    } finally {
      setDeleteLoading(false);
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
      setBannerAssetId(saveJson.data.studio.bannerAssetId ?? null);
      setBannerFocalX(saveJson.data.studio.bannerFocalX ?? null);
      setBannerFocalY(saveJson.data.studio.bannerFocalY ?? null);
      setPickingBannerFocal(true);
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

  const canPickBannerFocal = Boolean(bannerAssetId && bannerUrl);

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
        bannerFocalX={bannerFocalX}
        bannerFocalY={bannerFocalY}
        avatar={avatarNode}
        title={name || "Студия"}
        description={description}
        onEditBanner={() => bannerInputRef.current?.click()}
        onEditFocal={bannerUrl ? () => setPickingBannerFocal(true) : undefined}
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

      {canPickBannerFocal ? (
        <ModalSurface
          open={pickingBannerFocal}
          onClose={() => setPickingBannerFocal(false)}
          title="Точка фокуса"
        >
          <FocalPointPicker
            assetId={bannerAssetId!}
            imageUrl={bannerUrl!}
            initialFocalX={bannerFocalX}
            initialFocalY={bannerFocalY}
            onSave={async () => {
              await load();
              setPickingBannerFocal(false);
            }}
            onSkip={() => setPickingBannerFocal(false)}
          />
        </ModalSurface>
      ) : null}

      <StudioProfileForm
        name={name}
        description={description}
        address={addressText}
        phone={contactPhone}
        email={contactEmail}
        telegram={telegram}
        instagram={instagram}
        vk={vk}
        addressInputRef={addressInputRef}
        addressStatus={addressStatus}
        addressSuggestions={addressSuggestions}
        isAddressSuggestOpen={isAddressSuggestOpen}
        setIsAddressSuggestOpen={setIsAddressSuggestOpen}
        selectAddressSuggestion={selectAddressSuggestion}
        addressSuggestIndex={addressSuggestIndex}
        setAddressSuggestIndex={setAddressSuggestIndex}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onDescriptionInput={() => {
          resizeDescription();
        }}
        descriptionRef={descriptionRef}
        onAddressChange={handleAddressChange}
        onPhoneChange={setContactPhone}
        onEmailChange={setContactEmail}
        onTelegramChange={setTelegram}
        onInstagramChange={setInstagram}
        onVkChange={setVk}
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

      <div className="space-y-4 rounded-2xl bg-bg-card/90 p-4">
        <Tabs
          items={settingsTabs}
          value={settingsTab}
          onChange={(value) => setSettingsTab(value as StudioSettingsTab)}
          className="w-full"
        />

        {settingsTab === "notifications" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-bg-card p-4">
              <TelegramNotificationsSection embedded />
            </div>
            <div className="rounded-2xl bg-bg-card p-4">
              <VkNotificationsSection embedded />
            </div>
          </div>
        ) : null}

        {settingsTab === "features" ? (
          <FeatureGate
            feature="hotSlots"
            requiredPlan="PREMIUM"
            scope="STUDIO"
            title="Горящие слоты"
            description="Автоскидки на свободные окна по правилам студии."
          >
            <HotSlotsSettingsSection services={hotSlotServices} scope="STUDIO" />
          </FeatureGate>
        ) : null}

        {settingsTab === "studioSettings" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-bg-card p-4">
              <h3 className="text-sm font-semibold">Политика отмены</h3>
              <p className="mt-1 text-xs text-text-sec">
                Клиент может отменить запись не позднее указанного срока. Пустое значение - без ограничений, 0 - отмена запрещена.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={168}
                  inputMode="numeric"
                  value={cancellationDeadlineInput}
                  onChange={(event) => setCancellationDeadlineInput(event.target.value)}
                  placeholder="Например, 24"
                  className="h-10 w-[180px] rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="text-xs text-text-sec">
                  Текущее значение:{" "}
                  {cancellationDeadlineHours === null ? "Без ограничений" : `${cancellationDeadlineHours} ч.`}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-bg-card p-4">
              <h3 className="text-sm font-semibold">Напоминания</h3>
              <p className="mt-1 text-xs text-text-sec">
                Напоминания о записи за 24 часа и 2 часа до начала.
              </p>
              <label className="mt-3 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={(event) => setRemindersEnabled(event.target.checked)}
                />
                {remindersEnabled ? "Включено" : "Выключено"}
              </label>
            </div>
          </div>
        ) : null}
      </div>
      <section className="mt-12 border-t border-red-200/40 pt-8">
        <h2 className="text-sm font-semibold text-red-500">Удаление студии</h2>
        <p className="mt-1 text-xs text-text-sec">
          При удалении студии все мастера команды получат уведомление о расформировании. Удаление невозможно при наличии незавершённых записей.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteActiveCount(null);
            setDeleteModalOpen(true);
          }}
          className="mt-4 rounded-xl border border-red-300/60 px-4 py-2 text-sm text-red-500 hover:bg-red-50/10 transition-colors"
        >
          Удалить
        </button>
      </section>

      <StickySaveBar onSave={() => void save()} loading={saving} disabled={saving} />
      <div id="reviews" />
      <DeleteCabinetModal
        open={deleteModalOpen}
        type="studio"
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteStudio}
        loading={deleteLoading}
        activeBookingsCount={deleteActiveCount}
        error={deleteError}
      />
    </div>
  );
}
