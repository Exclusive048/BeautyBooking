"use client";

import { MediaEntityType } from "@prisma/client";
import { AlertTriangle, Lock, Send, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { FocalPointPicker } from "@/features/media/components/focal-point-picker";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import { StickySaveBar } from "@/features/studio-cabinet/components/sticky-save-bar";
import { StudioProfileForm } from "@/features/studio-cabinet/components/studio-profile-form";
import { StudioProfileHero } from "@/features/studio-cabinet/components/studio-profile-hero";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { useAddressWithGeocode } from "@/lib/maps/use-address-with-geocode";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { StudioServicesPage } from "./studio-services-page";

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

type Props = {
  providerId: string;
  studioId: string;
  initialTab?: string | null;
};

type StudioTab = "main" | "services" | "portfolio" | "settings";

const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: "main", label: UI_TEXT.master.profile.tabs.main },
  { id: "services", label: UI_TEXT.master.profile.tabs.services },
  { id: "portfolio", label: UI_TEXT.master.profile.tabs.portfolio },
  { id: "settings", label: UI_TEXT.master.profile.tabs.settings },
];

function normalizeTab(value: string | null | undefined): StudioTab {
  if (value === "main" || value === "services" || value === "portfolio" || value === "settings") {
    return value;
  }
  return "main";
}

function SettingsSection({
  title,
  children,
  pro = false,
}: {
  title: string;
  children: ReactNode;
  pro?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-sec">{title}</h2>
        {pro ? (
          <span className="rounded-full bg-[#c6a97e]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c6a97e]">
            PRO
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">{children}</div>
    </section>
  );
}

function SectionDivider() {
  return <div className="h-px bg-border-subtle" />;
}

function LockedAddonRow({
  title,
  hint,
  icon,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 opacity-65">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-main">{title}</p>
          <span className="rounded-full bg-[#c6a97e]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c6a97e]">
            PRO
          </span>
        </div>
        <p className="mt-0.5 text-xs text-text-sec">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {icon}
        <Link
          href="/cabinet/billing?scope=STUDIO"
          className="rounded-xl border border-border-subtle bg-bg-input px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-bg-card"
        >
          {UI_TEXT.settings.billing.featureGate.cta}
        </Link>
      </div>
    </div>
  );
}

export function StudioSettingsPage({ providerId, studioId, initialTab }: Props) {
  const t = UI_TEXT.studio.profilePage;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const plan = usePlanFeatures("STUDIO");

  const [activeTab, setActiveTab] = useState<StudioTab>(() => normalizeTab(initialTab));
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

  const hasTelegramAccess = plan.can("notifications") && plan.can("tgNotifications");
  const hasVkAccess = plan.can("notifications") && plan.can("vkNotifications");
  const hasHotSlotsAccess = plan.can("hotSlots");

  useEffect(() => {
    const tab = normalizeTab(searchParams.get("tab"));
    setActiveTab(tab);
  }, [searchParams]);

  const switchTab = useCallback(
    (tab: StudioTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const studioRes = await fetchWithAuth(`/api/studios/${providerId}`, { cache: "no-store" });
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
  }, [providerId, setAddressSnapshot, t.apiErrorPrefix, t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHotSlotServices = useCallback(async (): Promise<void> => {
    try {
      const res = await fetchWithAuth(`/api/studio/services?studioId=${encodeURIComponent(studioId)}`, {
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

      const res = await fetchWithAuth(`/api/studios/${providerId}`, {
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

      const nextDeadline = json.data.studio.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(nextDeadline);
      setCancellationDeadlineInput(nextDeadline === null ? "" : String(nextDeadline));
      setRemindersEnabled(json.data.studio.remindersEnabled ?? true);
      setIsPublished(json.data.studio.isPublished);
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
      const res = await fetchWithAuth("/api/cabinet/studio/delete", { method: "DELETE" });
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

      const uploadRes = await fetchWithAuth("/api/media", { method: "POST", body: formData });
      const uploadJson = (await uploadRes.json().catch(() => null)) as ApiResponse<{ asset: { id: string } }> | null;
      if (!uploadRes.ok || !uploadJson || !uploadJson.ok) {
        throw new Error(
          uploadJson && !uploadJson.ok
            ? uploadJson.error.message
            : `${t.apiErrorPrefix}: ${uploadRes.status}`
        );
      }

      const saveRes = await fetchWithAuth(`/api/studios/${providerId}`, {
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

  const removeBanner = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const saveRes = await fetchWithAuth(`/api/studios/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerAssetId: null }),
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
      setPickingBannerFocal(false);
      markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.uploadBannerFailed);
    } finally {
      setSaving(false);
    }
  };

  const canPickBannerFocal = Boolean(bannerAssetId && bannerUrl);
  const showSaveBar = activeTab === "main" || activeTab === "settings";

  const avatarNode = useMemo(
    () => (
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-bg-main bg-bg-elevated">
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
    [providerId]
  );

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.loading}</div>;
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-bg-card/70 p-2 lg:flex-col lg:p-3">
          {STUDIO_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "bg-bg-input text-text-main shadow-card" : "text-text-sec hover:text-text-main"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          {activeTab === "main" ? (
            <>
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
                onRemoveBanner={bannerUrl ? () => void removeBanner() : undefined}
                onEditFocal={bannerUrl ? () => setPickingBannerFocal(true) : undefined}
                isBusy={saving}
              />
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
            </>
          ) : null}

          {activeTab === "services" ? (
            <StudioServicesPage studioId={studioId} />
          ) : null}

          {activeTab === "portfolio" ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-bg-card/90 p-4">
                <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.sections.portfolioTitle}</h3>
                <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.sections.portfolioDesc}</p>
              </div>
              <div className="lux-card rounded-[24px] p-5">
                <PortfolioEditor entityType={MediaEntityType.STUDIO} entityId={providerId} canEdit />
              </div>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="space-y-8 p-1">
              <div>
                <h3 className="text-xl font-semibold">{UI_TEXT.settings.title}</h3>
                <p className="mt-1 text-sm text-text-sec">{UI_TEXT.settings.subtitle}</p>
              </div>

              <SettingsSection title={UI_TEXT.settings.sections.publicPage}>
                <PublicUsernameCard endpoint="/api/cabinet/studio/public-username" />
              </SettingsSection>

              <SettingsSection title={UI_TEXT.settings.sections.bookingRules}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{UI_TEXT.settings.autoConfirm.title}</p>
                      <p className="mt-0.5 text-xs text-text-sec">{UI_TEXT.settings.autoConfirm.hint}</p>
                    </div>
                    <Switch checked={false} disabled className="shrink-0" />
                  </div>
                  <p className="mt-2 text-xs text-text-sec">{UI_TEXT.settings.billing.featureGate.hint}</p>
                </div>
                <SectionDivider />
                <div className="p-4">
                  <p className="text-sm font-medium">{UI_TEXT.settings.cancellation.title}</p>
                  <p className="mt-0.5 text-xs text-text-sec">{UI_TEXT.settings.cancellation.hint}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="relative w-32">
                      <input
                        type="number"
                        min={0}
                        max={168}
                        inputMode="numeric"
                        value={cancellationDeadlineInput}
                        onChange={(event) => setCancellationDeadlineInput(event.target.value)}
                        disabled={saving}
                        className="h-10 w-full rounded-xl border border-border-subtle bg-bg-input px-3 pr-8 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="24"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-sec">
                        {UI_TEXT.common.hoursShortLetter}
                      </span>
                    </div>
                    {saved ? <span className="text-xs text-text-sec">{UI_TEXT.common.saved}</span> : null}
                  </div>
                  <p className="mt-2 text-xs text-text-sec">
                    {cancellationDeadlineHours === null
                      ? UI_TEXT.common.noLimit
                      : `${cancellationDeadlineHours} ${UI_TEXT.common.hoursShortLetter}`}
                  </p>
                </div>
                <SectionDivider />
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{UI_TEXT.studio.settingsPanel.remindersTitle}</p>
                    <p className="mt-0.5 text-xs text-text-sec">{UI_TEXT.studio.settingsPanel.remindersHint}</p>
                  </div>
                  <Switch
                    checked={remindersEnabled}
                    disabled={saving}
                    onCheckedChange={(nextValue) => setRemindersEnabled(nextValue)}
                    className="shrink-0"
                  />
                </div>
              </SettingsSection>

              <SettingsSection title={UI_TEXT.settings.sections.proFeatures} pro>
                {hasTelegramAccess ? (
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
                ) : (
                  <LockedAddonRow
                    title={UI_TEXT.settings.telegram.title}
                    hint={UI_TEXT.settings.telegram.hint}
                    icon={
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2AABEE]/15">
                        <Send className="h-5 w-5 text-[#2AABEE]" />
                      </div>
                    }
                  />
                )}
                <SectionDivider />
                {hasVkAccess ? (
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
                ) : (
                  <LockedAddonRow
                    title={UI_TEXT.settings.vk.title}
                    hint={UI_TEXT.settings.vk.hint}
                    icon={
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4C75A3]/15">
                        <Users className="h-5 w-5 text-[#4C75A3]" />
                      </div>
                    }
                  />
                )}
                <SectionDivider />
                {hasHotSlotsAccess ? (
                  <HotSlotsSettingsSection services={hotSlotServices} scope="STUDIO" embedded />
                ) : (
                  <LockedAddonRow
                    title={UI_TEXT.settings.hotSlots.title}
                    hint={UI_TEXT.settings.hotSlots.hint}
                    icon={
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-input">
                        <Lock className="h-5 w-5 text-text-main" />
                      </div>
                    }
                  />
                )}
              </SettingsSection>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/4 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-red-300">{UI_TEXT.studio.danger.title}</p>
                    <p className="mt-1 text-xs text-text-sec">{UI_TEXT.studio.danger.hint}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteActiveCount(null);
                        setDeleteModalOpen(true);
                      }}
                      className="mt-3 rounded-xl border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      {UI_TEXT.studio.danger.cta}
                    </button>
                  </div>
                </div>
              </div>

              <div id="reviews" />
            </div>
          ) : null}
        </div>
      </div>

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
          title={t.bannerFocusTitle}
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

      {showSaveBar ? (
        <StickySaveBar onSave={() => void save()} isSaving={saving} saved={saved} error={error} disabled={saving} />
      ) : null}

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
