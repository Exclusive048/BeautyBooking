"use client";

import { MediaEntityType } from "@prisma/client";
import { AlertTriangle, Send, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import { ShareProfileSection } from "@/features/cabinet/components/share-profile-section";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { useAddressWithGeocode } from "@/lib/maps/use-address-with-geocode";
import { StudioProfileHero } from "@/features/studio-cabinet/components/studio-profile-hero";
import { StudioProfileForm } from "@/features/studio-cabinet/components/studio-profile-form";
import { StickySaveBar } from "@/features/studio-cabinet/components/sticky-save-bar";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CropPicker } from "@/features/media/components/crop-picker";
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

type StudioSettingsTab = "notifications" | "features" | "settings";

export function StudioProfilePage({ providerId, studioId }: Props) {
  const t = UI_TEXT.studio.profilePage;
  const studioSettingsText = UI_TEXT.studio.settingsPanel;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
  const savedTimeoutRef = useRef<number | null>(null);
  const settingsTabs = [
    { id: "notifications" as const, label: UI_TEXT.studio.tabs.notifications },
    { id: "features" as const, label: UI_TEXT.studio.tabs.features },
    { id: "settings" as const, label: UI_TEXT.studio.tabs.settings },
  ];

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
    setSaving(true);
    setError(null);
    setSaved(false);
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
          throw new Error(t.deadlineValidation);
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
      markSaved();
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
          setDeleteError(json && !json.ok ? json.error.message : `${t.deleteErrorPrefix}: ${res.status}`);
        }
        return;
      }
      setDeleteModalOpen(false);
      router.push("/cabinet/roles");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t.deleteFailed);
    } finally {
      setDeleteLoading(false);
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
      markSaved();
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
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-bg-main bg-bg-elevated">
      <AvatarEditor
        entityType={MediaEntityType.STUDIO}
        entityId={providerId}
        canEdit
        showAddButton={false}
        sizeClassName="h-20 w-20"
      />
    </div>
  );

  const canPickBannerFocal = Boolean(bannerAssetId && bannerUrl);

  return (
    <div className="space-y-6">

      <StudioProfileHero
        bannerUrl={bannerUrl}
        bannerFocalX={bannerFocalX}
        bannerFocalY={bannerFocalY}
        avatar={avatarNode}
        studioName={name}
        subtitle={UI_TEXT.studio.profile.subtitle}
        isPublished={isPublished}
        onTogglePublished={setIsPublished}
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
          title={UI_TEXT.media.crop.titleBanner}
        >
          <CropPicker
            assetId={bannerAssetId!}
            imageUrl={bannerUrl!}
            shape="rect"
            aspectRatio={16 / 9}
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
        onAddressChange={handleAddressChange}
        onPhoneChange={setContactPhone}
        onEmailChange={setContactEmail}
        onTelegramChange={setTelegram}
        onInstagramChange={setInstagram}
        onVkChange={setVk}
      />

      <PublicUsernameCard endpoint="/api/cabinet/studio/public-username" />
      <ShareProfileSection endpoint="/api/cabinet/studio/public-username" />

      <div className="space-y-4 rounded-2xl bg-bg-card/90 p-4">
        <div className="flex rounded-xl border border-border-subtle bg-bg-input p-1">
          {settingsTabs.map((tab) => (
            <Button
              key={tab.id}
              variant="secondary"
              size="none"
              onClick={() => setSettingsTab(tab.id)}
              className={[
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                settingsTab === tab.id
                  ? "bg-bg-card text-text-main shadow-card"
                  : "text-text-sec hover:text-text-main",
              ].join(" ")}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {settingsTab === "notifications" ? (
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
            <TelegramNotificationsSection
              embedded
              title={UI_TEXT.settings.telegram.title}
              hint={UI_TEXT.settings.telegram.hint}
              connectLabel={UI_TEXT.settings.telegram.connect}
              connectButtonClassName="shrink-0 rounded-xl border border-border-subtle bg-bg-input px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-bg-card"
              leadingIcon={
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2AABEE]/15">
                  <Send className="h-5 w-5 text-[#2AABEE]" />
                </div>
              }
            />
            <div className="h-px bg-border-subtle" />
            <VkNotificationsSection
              embedded
              title={UI_TEXT.settings.vk.title}
              hint={UI_TEXT.settings.vk.hint}
              connectLabel={UI_TEXT.settings.vk.connect}
              connectButtonClassName="shrink-0 rounded-xl border border-border-subtle bg-bg-input px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-bg-card"
              leadingIcon={
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4C75A3]/15">
                  <Users className="h-5 w-5 text-[#4C75A3]" />
                </div>
              }
            />
          </div>
        ) : null}

        {settingsTab === "features" ? (
          <FeatureGate
            feature="hotSlots"
            requiredPlan="PREMIUM"
            scope="STUDIO"
            title={studioSettingsText.hotSlotsTitle}
            description={studioSettingsText.hotSlotsDescription}
          >
            <HotSlotsSettingsSection services={hotSlotServices} scope="STUDIO" />
          </FeatureGate>
        ) : null}

        {settingsTab === "settings" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-bg-card p-4">
              <h3 className="text-sm font-semibold">{studioSettingsText.cancellationTitle}</h3>
              <p className="mt-1 text-xs text-text-sec">{studioSettingsText.cancellationHint}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={168}
                  inputMode="numeric"
                  value={cancellationDeadlineInput}
                  onChange={(event) => setCancellationDeadlineInput(event.target.value)}
                  placeholder={studioSettingsText.cancellationPlaceholder}
                  className="h-10 w-[180px] rounded-xl"
                />
                <div className="text-xs text-text-sec">
                  {studioSettingsText.currentValueLabel}
                  {cancellationDeadlineHours === null
                    ? studioSettingsText.noLimit
                    : studioSettingsText.hoursValue(cancellationDeadlineHours)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-bg-card p-4">
              <h3 className="text-sm font-semibold">{studioSettingsText.remindersTitle}</h3>
              <p className="mt-1 text-xs text-text-sec">{studioSettingsText.remindersHint}</p>
              <label className="mt-3 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={(event) => setRemindersEnabled(event.target.checked)}
                />
                {remindersEnabled ? studioSettingsText.remindersOn : studioSettingsText.remindersOff}
              </label>
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-red-500/20 bg-red-500/4 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-300">{UI_TEXT.studio.danger.title}</p>
            <p className="mt-1 text-xs text-text-sec">{UI_TEXT.studio.danger.hint}</p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setDeleteActiveCount(null);
                setDeleteModalOpen(true);
              }}
              className="mt-3"
            >
              {UI_TEXT.studio.danger.cta}
            </Button>
          </div>
        </div>
      </div>

      <StickySaveBar onSave={() => void save()} isSaving={saving} saved={saved} error={error} disabled={saving} />
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




