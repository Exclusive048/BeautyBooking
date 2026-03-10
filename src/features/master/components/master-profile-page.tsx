/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FocalImage } from "@/components/ui/focal-image";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { ConnectedAccountsSection } from "@/features/master/components/connected-accounts-section";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import {
  useAddressWithGeocode,
  type AddressCoords,
  type AddressSource,
  type GeoStatus,
} from "@/lib/maps/use-address-with-geocode";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";

type MasterServiceItem = {
  serviceId: string;
  title: string;
  globalCategoryId: string | null;
  globalCategory: { id: string; name: string } | null;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
  basePrice: number;
  baseDurationMin: number;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  effectivePrice: number;
  effectiveDurationMin: number;
  canEditPrice: boolean;
};

type BookingQuestionDraft = {
  id?: string;
  tempId: string;
  text: string;
  required: boolean;
  order: number;
};

type BookingConfigDraft = {
  requiresReferencePhoto: boolean;
  questions: BookingQuestionDraft[];
};

type PortfolioItem = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  serviceIds: string[];
  globalCategoryId: string | null;
  categorySource: string | null;
  inSearch: boolean;
  createdAt: string;
};

type MasterProfileData = {
  master: {
    id: string;
    displayName: string;
    tagline: string;
    address: string;
    geoLat: number | null;
    geoLng: number | null;
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

type GlobalCategoryOption = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId?: string | null;
  depth?: number;
  fullPath?: string;
};

type PendingPortfolioMeta = {
  assetId: string;
  mediaUrl: string;
};

type ApiErrorShape = {
  ok: false;
  error:
    | {
        message: string;
        details?: unknown;
        fieldErrors?: Record<string, string | string[]>;
      }
    | string;
  code?: string;
};

type ProfileTab = "main" | "services" | "portfolio" | "settings";

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "main", label: UI_TEXT.master.profile.tabs.main },
  { id: "services", label: UI_TEXT.master.profile.tabs.services },
  { id: "portfolio", label: UI_TEXT.master.profile.tabs.portfolio },
  { id: "settings", label: UI_TEXT.master.profile.tabs.settings },
];

const SERVICE_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const SAVE_ADDRESS_ERROR_MESSAGE = UI_TEXT.master.profile.errors.saveAddress;

function buildDurationOptions(value: number): number[] {
  if (!Number.isFinite(value) || value <= 0) return SERVICE_DURATION_OPTIONS;
  return SERVICE_DURATION_OPTIONS.includes(value) ? SERVICE_DURATION_OPTIONS : [value, ...SERVICE_DURATION_OPTIONS];
}

function parseMediaAssetId(url: string): string | null {
  const match = url.match(/\/api\/media\/file\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function buildTempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (typeof json.error === "string") {
    return json.error.trim() || fallback;
  }
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
        const issue = first as { message?: unknown; path?: unknown };
        const message = issue.message;
        const path = issue.path;
        if (
          typeof path === "string" &&
          path.trim() &&
          typeof message === "string" &&
          message.trim()
        ) {
          return `${path}: ${message}`;
        }
        if (typeof message === "string" && message.trim()) return message;
      }
    }
  }
  return json.error.message || fallback;
}

function parseApiErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  const message = record.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  return null;
}

async function readErrorMessage(
  res: Response,
  parsed?: unknown,
  fallback = SAVE_ADDRESS_ERROR_MESSAGE
): Promise<string> {
  const parsedMessage = parseApiErrorMessage(parsed);
  if (parsedMessage) return parsedMessage;

  try {
    const data = await res.json();
    const message = parseApiErrorMessage(data);
    if (message) return message;
  } catch {
    // ignore read errors
  }

  return fallback;
}

function firstFieldError(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0);
    return first ?? null;
  }
  return null;
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
  const router = useRouter();
  const [data, setData] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveInfo, setAutosaveInfo] = useState<string | null>(null);
  const plan = usePlanFeatures("MASTER");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteActiveCount, setDeleteActiveCount] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<NotificationCenterInviteItem[]>([]);
  const [autoConfirmBookings, setAutoConfirmBookings] = useState<boolean | null>(null);
  const [autoConfirmLoading, setAutoConfirmLoading] = useState(false);
  const [autoConfirmSaving, setAutoConfirmSaving] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean | null>(null);
  const [remindersSaving, setRemindersSaving] = useState(false);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState<number | null>(null);
  const [cancellationDeadlineInput, setCancellationDeadlineInput] = useState("");
  const [cancellationDeadlineSaving, setCancellationDeadlineSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("main");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileFieldErrors, setProfileFieldErrors] = useState<{ displayName?: string }>({});

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const {
    inputRef: addressInputRef,
    addressText,
    addressCoords,
    addressSource,
    geoStatus,
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
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const [avatarFocalX, setAvatarFocalX] = useState<number | null>(null);
  const [avatarFocalY, setAvatarFocalY] = useState<number | null>(null);
  const [servicesDraft, setServicesDraft] = useState<Record<string, MasterServiceItem>>({});

  const [newSoloServiceTitle, setNewSoloServiceTitle] = useState("");
  const [newSoloServicePrice, setNewSoloServicePrice] = useState<number>(0);
  const [newSoloServiceDuration, setNewSoloServiceDuration] = useState<number>(60);
  const [newSoloServiceGlobalCategoryId, setNewSoloServiceGlobalCategoryId] = useState("");
  const [globalCategories, setGlobalCategories] = useState<GlobalCategoryOption[]>([]);
  const [newSoloServiceFieldErrors, setNewSoloServiceFieldErrors] = useState<{
    title?: string;
    price?: string;
    durationMin?: string;
  }>({});
  const [showAddServicePanel, setShowAddServicePanel] = useState(false);
  const [selectedStudioServiceId, setSelectedStudioServiceId] = useState("");
  const [serviceFieldErrors, setServiceFieldErrors] = useState<
    Record<string, { price?: string; duration?: string }>
  >({});

  const [bookingConfigServiceId, setBookingConfigServiceId] = useState<string | null>(null);
  const [bookingConfigDraft, setBookingConfigDraft] = useState<BookingConfigDraft | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigSaving, setBookingConfigSaving] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);

  const [dropActive, setDropActive] = useState(false);
  const [brokenPortfolio, setBrokenPortfolio] = useState<Record<string, boolean>>({});

  const [pendingPortfolioMeta, setPendingPortfolioMeta] = useState<PendingPortfolioMeta | null>(null);
  const [portfolioCaption, setPortfolioCaption] = useState("");
  const [portfolioServiceId, setPortfolioServiceId] = useState("");
  const [portfolioGlobalCategoryId, setPortfolioGlobalCategoryId] = useState("");
  const [portfolioMetaOpen, setPortfolioMetaOpen] = useState(false);
  const [portfolioAssetIdsByUrl, setPortfolioAssetIdsByUrl] = useState<Record<string, string>>({});
  const [portfolioCategoryTarget, setPortfolioCategoryTarget] = useState<PortfolioItem | null>(null);
  const [portfolioCategoryDraft, setPortfolioCategoryDraft] = useState("");
  const [portfolioCategorySaving, setPortfolioCategorySaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);
  const newPortfolioInputRef = useRef<HTMLInputElement | null>(null);
  const serviceAutosaveTimer = useRef<number | null>(null);
  const profileAutosaveTimer = useRef<number | null>(null);
  const profileHydratedRef = useRef(false);
  const profileSavingRef = useRef(false);
  const profilePendingRef = useRef(false);
  const servicesSavingRef = useRef(false);
  const servicesPendingRef = useRef(false);
  const profileSnapshotRef = useRef({
    displayName: "",
    tagline: "",
    addressText: "",
    bio: "",
    avatarUrl: "",
    isPublished: false,
    addressCoords: null as AddressCoords | null,
    addressSource: "manual" as AddressSource,
    geoStatus: "idle" as GeoStatus,
  });
  const servicesSnapshotRef = useRef<MasterServiceItem[]>([]);
  const dataRef = useRef<MasterProfileData | null>(null);
  const hydratedRef = useRef(false);
  const isMountedRef = useRef(true);

    const load = useCallback(async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/master/profile", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<MasterProfileData> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }

        const profileData = json.data;
        dataRef.current = profileData;
        const hasCoords =
          typeof profileData.master.geoLat === "number" &&
          Number.isFinite(profileData.master.geoLat) &&
          typeof profileData.master.geoLng === "number" &&
          Number.isFinite(profileData.master.geoLng);
        const coords = hasCoords
          ? { lat: profileData.master.geoLat!, lng: profileData.master.geoLng! }
          : null;
        const nextGeoStatus: GeoStatus = "idle";

        profileSnapshotRef.current = {
          displayName: profileData.master.displayName,
          tagline: profileData.master.tagline,
          addressText: profileData.master.address,
          bio: profileData.master.bio ?? "",
          avatarUrl: profileData.master.avatarUrl ?? "",
          isPublished: profileData.master.isPublished,
          addressCoords: coords,
          addressSource: "manual",
          geoStatus: nextGeoStatus,
        };
        servicesSnapshotRef.current = profileData.services;
        profileSavingRef.current = false;
        profilePendingRef.current = false;
        servicesSavingRef.current = false;
        servicesPendingRef.current = false;
        setData(profileData);
        setDisplayName(profileData.master.displayName);
        setTagline(profileData.master.tagline);
        setAddressSnapshot({ text: profileData.master.address, coords });
        setBio(profileData.master.bio ?? "");
      setAvatarUrl(profileData.master.avatarUrl ?? "");
      setIsPublished(profileData.master.isPublished);
      setProfileSaveStatus("idle");
      setProfileFieldErrors({});
      setServicesDraft(Object.fromEntries(profileData.services.map((item) => [item.serviceId, item])));

      const categoriesRes = await fetch("/api/catalog/global-categories?status=APPROVED", {
        cache: "no-store",
      });
      const categoriesJson = (await categoriesRes.json().catch(() => null)) as
        | ApiResponse<{ categories: GlobalCategoryOption[] }>
        | null;
      if (categoriesRes.ok && categoriesJson && categoriesJson.ok) {
        setGlobalCategories(categoriesJson.data.categories);
      } else {
        setGlobalCategories([]);
      }

      const [avatarRes, portfolioRes] = await Promise.all([
        fetch(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=AVATAR`, { cache: "no-store" }),
        fetch(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=PORTFOLIO`, { cache: "no-store" }),
      ]);

      const avatarJson = (await avatarRes.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (avatarRes.ok && avatarJson && avatarJson.ok) {
        const avatarAsset = avatarJson.data.assets[0] ?? null;
        setAvatarAssetId(avatarAsset?.id ?? null);
        setAvatarFocalX(avatarAsset?.focalX ?? null);
        setAvatarFocalY(avatarAsset?.focalY ?? null);
      } else {
        setAvatarAssetId(null);
        setAvatarFocalX(null);
        setAvatarFocalY(null);
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
      profileHydratedRef.current = false;
      setAutosaveInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadProfile);
    } finally {
      setLoading(false);
    }
  }, [setAddressSnapshot]);

    useEffect(() => {
      void load();
    }, [load]);

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    useEffect(() => {
      if (!isAddressSuggestOpen) return;
      const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (!addressSuggestRootRef.current) return;
        if (!addressSuggestRootRef.current.contains(target)) {
          setIsAddressSuggestOpen(false);
        }
      };

      document.addEventListener("mousedown", handleDocumentClick);
      document.addEventListener("touchstart", handleDocumentClick);
      return () => {
        document.removeEventListener("mousedown", handleDocumentClick);
        document.removeEventListener("touchstart", handleDocumentClick);
      };
    }, [isAddressSuggestOpen, setIsAddressSuggestOpen]);

    useEffect(() => {
      profileSnapshotRef.current = {
        displayName,
        tagline,
        addressText,
        bio,
        avatarUrl,
        isPublished,
        addressCoords,
        addressSource,
        geoStatus,
      };
    }, [
      displayName,
      tagline,
      addressText,
      avatarUrl,
      bio,
      isPublished,
      addressCoords,
      addressSource,
      geoStatus,
    ]);

    useEffect(() => {
      servicesSnapshotRef.current = Object.values(servicesDraft);
    }, [servicesDraft]);

  useEffect(() => {
    if (!bookingConfigServiceId) {
      setBookingConfigDraft(null);
      setBookingConfigError(null);
      return;
    }

    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/master/services/${bookingConfigServiceId}/booking-config`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{
          requiresReferencePhoto: boolean;
          questions: Array<{ id: string; text: string; required: boolean; order: number }>;
        }> | null;

        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }

        const config = json.data;
        const draft: BookingConfigDraft = {
          requiresReferencePhoto: config.requiresReferencePhoto,
          questions: (config.questions ?? []).map((question, index) => ({
            id: question.id,
            tempId: question.id || buildTempId("question"),
            text: question.text,
            required: question.required,
            order: Number.isFinite(question.order) ? question.order : index,
          })),
        };

        if (!cancelled) {
          setBookingConfigDraft(draft);
        }
      } catch (err) {
        if (!cancelled) {
          setBookingConfigDraft(null);
          setBookingConfigError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadBookingConfig);
        }
      } finally {
        if (!cancelled) {
          setBookingConfigLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingConfigServiceId]);

  useEffect(() => {
    if (!data?.master.isSolo) {
      setAutoConfirmBookings(null);
      setRemindersEnabled(null);
      setCancellationDeadlineHours(null);
      setCancellationDeadlineInput("");
      return;
    }

    const controller = new AbortController();
    setAutoConfirmLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/providers/me/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{
              autoConfirmBookings: boolean;
              cancellationDeadlineHours: number | null;
              remindersEnabled: boolean;
            }>
          | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setAutoConfirmBookings(json.data.autoConfirmBookings);
        setRemindersEnabled(json.data.remindersEnabled);
        const deadlineValue = json.data.cancellationDeadlineHours ?? null;
        setCancellationDeadlineHours(deadlineValue);
        setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAutoConfirmBookings(null);
        setRemindersEnabled(null);
        setCancellationDeadlineHours(null);
        setCancellationDeadlineInput("");
      } finally {
        if (!controller.signal.aborted) {
          setAutoConfirmLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [data?.master.isSolo]);

  useEffect(() => {
    const loadInvites = async () => {
      try {
        const res = await fetch("/api/notifications/center", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ invites: NotificationCenterInviteItem[] }>
          | null;
        if (!res.ok || !json || !json.ok) return;
        setPendingInvites(json.data.invites);
      } catch {
        // Keep profile usable even if notifications center is unavailable.
      }
    };

    void loadInvites();
  }, []);

  const handleDeleteMaster = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    setDeleteActiveCount(null);
    try {
      const res = await fetch("/api/cabinet/master/delete", { method: "DELETE" });
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
          setDeleteError(
            json && !json.ok ? json.error.message : `${UI_TEXT.master.profile.errors.apiErrorPrefix} ${res.status}`
          );
        }
        return;
      }
      setDeleteModalOpen(false);
      router.push("/cabinet/roles");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.deleteCabinet);
    } finally {
      setDeleteLoading(false);
    }
  };

  const serviceList = useMemo(() => Object.values(servicesDraft), [servicesDraft]);
  const disabledServices = useMemo(
    () => serviceList.filter((service) => !service.isEnabled),
    [serviceList]
  );
  const serviceTitleById = useMemo(
    () => new Map(serviceList.map((service) => [service.serviceId, service.title])),
    [serviceList]
  );
  const portfolioCategoryOptions = useMemo(() => {
    const seen = new Set<string>();
    return serviceList
      .filter((service) => service.isEnabled)
      .filter(
        (service) =>
          typeof service.globalCategoryId === "string" &&
          service.globalCategoryId.length > 0 &&
          typeof service.globalCategory?.name === "string" &&
          service.globalCategory.name.length > 0
      )
      .filter((service) => {
        const categoryId = service.globalCategoryId as string;
        if (seen.has(categoryId)) return false;
        seen.add(categoryId);
        return true;
      })
      .map((service) => ({
        id: service.globalCategoryId as string,
        name: service.globalCategory?.name as string,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [serviceList]);
  const portfolioFilteredServices = useMemo(
    () =>
      portfolioGlobalCategoryId
        ? serviceList
            .filter((service) => service.isEnabled && service.globalCategoryId === portfolioGlobalCategoryId)
            .sort((a, b) => a.title.localeCompare(b.title, "ru"))
        : [],
    [portfolioGlobalCategoryId, serviceList]
  );
  const portfolioLimit = data?.master.isSolo
    ? plan.limit("maxPortfolioPhotosSolo")
    : plan.limit("maxPortfolioPhotosPerStudioMaster");
  const portfolioCount = data?.portfolio.length ?? 0;
  const portfolioLimitReached = portfolioLimit !== null && portfolioCount >= portfolioLimit;
  const portfolioLimitWarning =
    portfolioLimit !== null && portfolioCount >= Math.max(portfolioLimit - 1, 1);
  const portfolioLimitLabel =
    portfolioLimit === null ? UI_TEXT.common.noLimit : `${portfolioCount} / ${portfolioLimit}`;
  const onlinePaymentsAllowed = plan.can("onlinePayments");
  const onlinePaymentsSystemEnabled = plan.system?.onlinePaymentsEnabled ?? false;
  const canOnlinePayments = onlinePaymentsAllowed && onlinePaymentsSystemEnabled;
  const showOnlinePaymentsToggle = data?.master.isSolo ?? false;
  const onlinePaymentsLockedMessage = !onlinePaymentsAllowed
    ? UI_TEXT.master.profile.onlinePayments.proRequired
    : !onlinePaymentsSystemEnabled
      ? UI_TEXT.master.profile.onlinePayments.disabledByAdmin
      : null;

  function normalizePrice(value: number): number {
    return Math.ceil(value / 100) * 100;
  }

  function normalizeDuration(value: number): number {
    return Math.ceil(value / 5) * 5;
  }

  const saveProfile = useCallback(
      async (options?: { refresh?: boolean }): Promise<boolean> => {
        const currentData = dataRef.current;
        if (!currentData) return false;

        if (profileSavingRef.current) {
          profilePendingRef.current = true;
          return false;
        }

        const snapshot = profileSnapshotRef.current;
        const currentMaster = currentData.master;
        const payload: {
          displayName?: string;
          tagline?: string;
          address?: string;
          bio?: string | null;
          avatarUrl?: string | null;
          isPublished?: boolean;
          geoLat?: number | null;
          geoLng?: number | null;
        } = {};

        const nextDisplayName = snapshot.displayName.trim();
        if (!nextDisplayName) {
          setProfileFieldErrors({ displayName: UI_TEXT.master.profile.errors.displayNameRequired });
          setProfileSaveStatus("error");
          return false;
        }

        if (nextDisplayName !== currentMaster.displayName) {
          payload.displayName = nextDisplayName;
        }

        const nextTagline = snapshot.tagline.trim();
        if (nextTagline !== currentMaster.tagline) {
          payload.tagline = nextTagline;
        }

        const nextAddress = snapshot.addressText.trim();
        const currentAddress = currentMaster.address.trim();
        const addressChanged = nextAddress !== currentAddress;

        const nextBio = snapshot.bio.trim();
        const currentBio = (currentMaster.bio ?? "").trim();
        if (nextBio !== currentBio) {
          payload.bio = nextBio;
        }

        const nextAvatarUrl = snapshot.avatarUrl.trim() || null;
        const currentAvatarUrl = (currentMaster.avatarUrl ?? "").trim() || null;
        if (nextAvatarUrl !== currentAvatarUrl) {
          payload.avatarUrl = nextAvatarUrl;
        }

        if (snapshot.isPublished !== currentMaster.isPublished) {
          payload.isPublished = snapshot.isPublished;
        }

        const nextCoords =
          snapshot.addressCoords &&
          Number.isFinite(snapshot.addressCoords.lat) &&
          Number.isFinite(snapshot.addressCoords.lng)
            ? snapshot.addressCoords
            : null;
        const currentCoords =
          typeof currentMaster.geoLat === "number" &&
          Number.isFinite(currentMaster.geoLat) &&
          typeof currentMaster.geoLng === "number" &&
          Number.isFinite(currentMaster.geoLng)
            ? { lat: currentMaster.geoLat, lng: currentMaster.geoLng }
            : null;

        const coordsChanged =
          (nextCoords?.lat ?? null) !== (currentCoords?.lat ?? null) ||
          (nextCoords?.lng ?? null) !== (currentCoords?.lng ?? null);

        const coordsReady = !nextAddress || Boolean(nextCoords);

        if (addressChanged) {
          if (!nextAddress) {
            payload.address = "";
            payload.geoLat = null;
            payload.geoLng = null;
          } else if (coordsReady && nextCoords) {
            payload.address = nextAddress;
            payload.geoLat = nextCoords.lat;
            payload.geoLng = nextCoords.lng;
          }
        } else if (coordsChanged && coordsReady && nextCoords) {
          payload.geoLat = nextCoords.lat;
          payload.geoLng = nextCoords.lng;
        }

        if (Object.keys(payload).length === 0) {
          setProfileSaveStatus("saved");
          return true;
        }

        profileSavingRef.current = true;
        profilePendingRef.current = false;
        setProfileSaveStatus("saving");
        setError(null);
        try {
          const res = await fetch("/api/master/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const errorRes = res.clone();
          const json = (await res.json().catch(() => null)) as
            | ApiResponse<{ id: string }>
            | ApiErrorShape
            | null;
          if (!res.ok || !json || !json.ok) {
            const message = await readErrorMessage(
              errorRes,
              json && !json.ok ? json : null,
              SAVE_ADDRESS_ERROR_MESSAGE
            );
            throw new Error(message);
          }

          if (options?.refresh) {
            await load();
          } else {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    master: {
                      ...prev.master,
                      displayName: payload.displayName ?? prev.master.displayName,
                      tagline: payload.tagline ?? prev.master.tagline,
                      address: payload.address ?? prev.master.address,
                      geoLat: payload.geoLat !== undefined ? payload.geoLat : prev.master.geoLat,
                      geoLng: payload.geoLng !== undefined ? payload.geoLng : prev.master.geoLng,
                      bio: payload.bio ?? prev.master.bio,
                      avatarUrl: payload.avatarUrl ?? prev.master.avatarUrl,
                      isPublished: payload.isPublished ?? prev.master.isPublished,
                    },
                  }
                : prev
            );
          }

          setProfileSaveStatus("saved");
          return true;
        } catch (err) {
          setError(err instanceof Error ? err.message : SAVE_ADDRESS_ERROR_MESSAGE);
          setProfileSaveStatus("error");
          return false;
        } finally {
          profileSavingRef.current = false;
          if (profilePendingRef.current) {
            profilePendingRef.current = false;
            void saveProfile({ refresh: false });
          }
        }
      },
      [load]
    );

  useEffect(() => {
    if (!data) return;
    if (!profileHydratedRef.current) {
      profileHydratedRef.current = true;
      return;
    }

    if (!displayName.trim()) {
      setProfileFieldErrors({ displayName: UI_TEXT.master.profile.errors.displayNameRequired });
      setProfileSaveStatus("error");
      return;
    }

    const nextAddress = addressText.trim();
    const currentAddress = data.master.address.trim();
    const addressChanged = nextAddress !== currentAddress;
    const coordsReady =
      !nextAddress ||
      (addressCoords &&
        Number.isFinite(addressCoords.lat) &&
        Number.isFinite(addressCoords.lng));

    const nextBio = bio.trim();
    const currentBio = (data.master.bio ?? "").trim();
    const nextAvatarUrl = avatarUrl.trim() || null;
    const currentAvatarUrl = (data.master.avatarUrl ?? "").trim() || null;
    const otherFieldsChanged =
      displayName.trim() !== data.master.displayName ||
      tagline.trim() !== data.master.tagline ||
      nextBio !== currentBio ||
      nextAvatarUrl !== currentAvatarUrl ||
      isPublished !== data.master.isPublished;

    if (addressChanged && !coordsReady && !otherFieldsChanged) {
      return;
    }

    if (profileSavingRef.current) {
      profilePendingRef.current = true;
      return;
    }

    if (profileAutosaveTimer.current) {
      window.clearTimeout(profileAutosaveTimer.current);
    }

    setProfileSaveStatus("saving");
    profileAutosaveTimer.current = window.setTimeout(() => {
      void saveProfile({ refresh: false });
    }, 600);

    return () => {
      if (profileAutosaveTimer.current) {
        window.clearTimeout(profileAutosaveTimer.current);
      }
    };
  }, [
    addressText,
    avatarUrl,
    bio,
    data,
    displayName,
    addressCoords,
    addressSource,
    geoStatus,
    isPublished,
    saveProfile,
    tagline,
  ]);

  const updateAutoConfirm = async (nextValue: boolean): Promise<void> => {
    if (!data?.master.isSolo) return;
    setAutoConfirmSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/providers/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoConfirmBookings: nextValue }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{
            autoConfirmBookings: boolean;
            cancellationDeadlineHours: number | null;
            remindersEnabled: boolean;
          }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          extractApiErrorMessage(
            json && !json.ok ? json : null,
            `API error: ${res.status}`
          )
        );
      }
      setAutoConfirmBookings(json.data.autoConfirmBookings);
      setRemindersEnabled(json.data.remindersEnabled);
      const deadlineValue = json.data.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.updateSettings);
    } finally {
      setAutoConfirmSaving(false);
    }
  };

  const updateRemindersEnabled = async (nextValue: boolean): Promise<void> => {
    if (!data?.master.isSolo) return;
    setRemindersSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/providers/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindersEnabled: nextValue }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{
            autoConfirmBookings: boolean;
            cancellationDeadlineHours: number | null;
            remindersEnabled: boolean;
          }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          extractApiErrorMessage(
            json && !json.ok ? json : null,
            `API error: ${res.status}`
          )
        );
      }
      setAutoConfirmBookings(json.data.autoConfirmBookings);
      setRemindersEnabled(json.data.remindersEnabled);
      const deadlineValue = json.data.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.updateReminders);
    } finally {
      setRemindersSaving(false);
    }
  };

  const saveCancellationDeadline = async (): Promise<void> => {
    if (!data?.master.isSolo) return;
    setCancellationDeadlineSaving(true);
    setError(null);
    try {
      const trimmed = cancellationDeadlineInput.trim();
      let value: number | null;
      if (!trimmed) {
        value = null;
      } else {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) {
          throw new Error(UI_TEXT.master.profile.errors.invalidCancellationHours);
        }
        value = Math.floor(parsed);
      }

      const res = await fetch("/api/providers/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationDeadlineHours: value }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{
            autoConfirmBookings: boolean;
            cancellationDeadlineHours: number | null;
            remindersEnabled: boolean;
          }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          extractApiErrorMessage(
            json && !json.ok ? json : null,
            `API error: ${res.status}`
          )
        );
      }
      setAutoConfirmBookings(json.data.autoConfirmBookings);
      setRemindersEnabled(json.data.remindersEnabled);
      const deadlineValue = json.data.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.updateCancellationDeadline);
    } finally {
      setCancellationDeadlineSaving(false);
    }
  };

    const saveServices = useCallback(async (items?: MasterServiceItem[]): Promise<void> => {
      if (servicesSavingRef.current) {
        servicesPendingRef.current = true;
        return;
      }

      const snapshot = items ?? servicesSnapshotRef.current;
      if (snapshot.length === 0) return;

      servicesSavingRef.current = true;
      servicesPendingRef.current = false;
      const payloadItems = snapshot.map((item) => ({
        serviceId: item.serviceId,
        isEnabled: item.isEnabled,
        durationOverrideMin: item.isEnabled ? normalizeDuration(item.effectiveDurationMin) : item.durationOverrideMin,
        priceOverride:
          item.canEditPrice && item.isEnabled ? normalizePrice(item.effectivePrice) : undefined,
      }));

      try {
        const res = await fetch("/api/master/services", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: payloadItems }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
      } finally {
        servicesSavingRef.current = false;
        if (servicesPendingRef.current) {
          servicesPendingRef.current = false;
          void saveServices();
        }
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

    setAutosaveInfo(UI_TEXT.master.profile.autosave.saving);
    serviceAutosaveTimer.current = window.setTimeout(() => {
      void saveServices(items)
        .then(() => {
          setAutosaveInfo(UI_TEXT.master.profile.autosave.savedAuto);
        })
        .catch((saveError) => {
          setError(saveError instanceof Error ? saveError.message : UI_TEXT.master.profile.errors.saveServices);
          setAutosaveInfo(null);
        });
    }, 700);

    return () => {
      if (servicesSavingRef.current) {
        servicesPendingRef.current = true;
        return;
      }

      if (serviceAutosaveTimer.current) {
        window.clearTimeout(serviceAutosaveTimer.current);
      }
    };
  }, [saveServices, servicesDraft]);

  const createSoloService = async (): Promise<void> => {
    if (!data?.master.isSolo) return;
    const nextTitle = newSoloServiceTitle.trim();
    const errors: { title?: string; price?: string; durationMin?: string } = {};
    if (!nextTitle) errors.title = UI_TEXT.master.profile.errors.addServiceTitleRequired;
    if (!Number.isFinite(newSoloServicePrice) || newSoloServicePrice <= 0) {
      errors.price = UI_TEXT.master.profile.errors.addServicePriceRequired;
    }
    if (!Number.isFinite(newSoloServiceDuration) || newSoloServiceDuration <= 0) {
      errors.durationMin = UI_TEXT.master.profile.errors.addServiceDurationRequired;
    }
    if (Object.keys(errors).length > 0) {
      setNewSoloServiceFieldErrors(errors);
      return;
    }
    const normalizedPrice = normalizePrice(newSoloServicePrice);
    const normalizedDuration = normalizeDuration(newSoloServiceDuration);
    const selectedGlobalCategoryId = newSoloServiceGlobalCategoryId.trim();
    setNewSoloServicePrice(normalizedPrice);
    setNewSoloServiceDuration(normalizedDuration);
    setNewSoloServiceFieldErrors({});

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
          globalCategoryId: selectedGlobalCategoryId || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        const apiError = json && !json.ok ? json.error : null;
        const fieldErrors =
          apiError && typeof apiError === "object" && "fieldErrors" in apiError
            ? (apiError as { fieldErrors?: Record<string, string | string[]> }).fieldErrors
            : undefined;
        if (fieldErrors) {
          setNewSoloServiceFieldErrors({
            title: firstFieldError(fieldErrors.title) ?? undefined,
            price: firstFieldError(fieldErrors.price) ?? undefined,
            durationMin: firstFieldError(
              fieldErrors.durationMin ?? fieldErrors.duration
            ) ?? undefined,
          });
        } else {
          setNewSoloServiceFieldErrors({});
        }
        throw new Error(
          extractApiErrorMessage(
            json && !json.ok ? json : null,
            `API error: ${res.status}`
          )
        );
      }

      setNewSoloServiceTitle("");
      setNewSoloServicePrice(0);
      setNewSoloServiceDuration(60);
      setNewSoloServiceGlobalCategoryId("");
      setNewSoloServiceFieldErrors({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add service");
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
      setAvatarFocalX(asset.focalX ?? null);
      setAvatarFocalY(asset.focalY ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadAvatar);
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
      setAvatarFocalX(null);
      setAvatarFocalY(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.deleteAvatar);
    } finally {
      setSaving(false);
    }
  };

  const uploadPortfolioFile = async (file: File): Promise<void> => {
    if (!data) return;
    if (portfolioLimitReached) {
      setError(UI_TEXT.master.profile.errors.portfolioLimitReached);
      return;
    }
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
      setPortfolioServiceId("");
      setPortfolioGlobalCategoryId("");
      setPortfolioMetaOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.uploadPhoto);
    } finally {
      setSaving(false);
    }
  };

  const handlePortfolioDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (portfolioLimitReached) return;
    setDropActive(true);
  };

  const handlePortfolioDragLeave = () => {
    setDropActive(false);
  };

  const handlePortfolioDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    if (portfolioLimitReached) {
      setError(UI_TEXT.master.profile.errors.portfolioLimitReached);
      return;
    }
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) {
      void uploadPortfolioFile(file);
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
          serviceIds: portfolioServiceId ? [portfolioServiceId] : [],
          globalCategoryId: portfolioGlobalCategoryId || undefined,
          categorySource: portfolioGlobalCategoryId ? "user" : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          extractApiErrorMessage(json && !json.ok ? json : null, UI_TEXT.master.profile.errors.savePhotoDescription)
        );
      }
      setPendingPortfolioMeta(null);
      setPortfolioMetaOpen(false);
      setPortfolioCaption("");
      setPortfolioServiceId("");
      setPortfolioGlobalCategoryId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.savePhotoDescription);
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
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.removePhoto);
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
          globalCategoryId: item.globalCategoryId ?? undefined,
          categorySource: item.globalCategoryId ? "user" : undefined,
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
            UI_TEXT.master.profile.errors.replacePhoto
          )
        );
      }

      await removePortfolio(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.replacePhoto);
      setSaving(false);
    }
  };

  const openPortfolioCategoryModal = (item: PortfolioItem) => {
    setPortfolioCategoryTarget(item);
    setPortfolioCategoryDraft(item.globalCategoryId ?? "");
  };

  const savePortfolioCategory = async (): Promise<void> => {
    if (!portfolioCategoryTarget) return;
    setPortfolioCategorySaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/portfolio/${portfolioCategoryTarget.id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalCategoryId: portfolioCategoryDraft || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string; globalCategoryId: string | null; inSearch: boolean }>
        | ApiErrorShape
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(
          extractApiErrorMessage(json && !json.ok ? json : null, UI_TEXT.master.profile.errors.savePhotoDescription)
        );
      }
      setPortfolioCategoryTarget(null);
      setPortfolioCategoryDraft("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.savePhotoDescription);
    } finally {
      setPortfolioCategorySaving(false);
    }
  };

  const profileStatusText =
    profileSaveStatus === "saving"
      ? UI_TEXT.status.saving
      : profileSaveStatus === "saved"
        ? UI_TEXT.master.profile.status.savedChanges
        : profileSaveStatus === "error"
          ? UI_TEXT.master.profile.errors.saveFailed
          : "";

  const profileStatusTone =
    profileSaveStatus === "saved"
      ? "text-emerald-500"
      : profileSaveStatus === "error"
        ? "text-rose-500"
        : "text-text-sec";

  const addressStatusTone =
    addressStatus?.tone === "success"
      ? "text-emerald-500"
      : addressStatus?.tone === "error"
        ? "text-rose-400"
        : "text-text-sec";

  const handleAddressKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (addressSuggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(0);
          return;
        }
        setAddressSuggestIndex((prev) =>
          prev < addressSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(addressSuggestions.length - 1);
          return;
        }
        setAddressSuggestIndex((prev) =>
          prev <= 0 ? addressSuggestions.length - 1 : prev - 1
        );
        return;
      }

      if (event.key === "Enter" && isAddressSuggestOpen) {
        if (
          addressSuggestIndex >= 0 &&
          addressSuggestIndex < addressSuggestions.length
        ) {
          event.preventDefault();
          selectAddressSuggestion(addressSuggestions[addressSuggestIndex]);
        }
        return;
      }

      if (event.key === "Escape" && isAddressSuggestOpen) {
        setIsAddressSuggestOpen(false);
        return;
      }
    },
    [
      addressSuggestions,
      addressSuggestIndex,
      isAddressSuggestOpen,
      selectAddressSuggestion,
      setAddressSuggestIndex,
      setIsAddressSuggestOpen,
    ]
  );

  const previewName = displayName.trim() || UI_TEXT.master.profile.preview.nameFallback;
  const previewTagline = tagline.trim() || UI_TEXT.master.profile.preview.taglineFallback;
  const previewAddress = addressText.trim() || UI_TEXT.master.profile.preview.addressFallback;
  const previewBio = bio.trim();
  const inputBaseClass =
    "mt-1 w-full rounded-lg border border-transparent bg-bg-input px-3 py-2 text-sm text-text-main outline-none transition focus:border-border-subtle";
  const inputErrorClass = "border-rose-500 focus:border-rose-500";
  const selectBaseClass =
    "w-full rounded-lg border border-transparent bg-bg-input px-2.5 py-2 text-sm text-text-main outline-none transition focus:border-border-subtle disabled:opacity-60";
  const previewAvatar = avatarUrl ? (
    <FocalImage
      src={avatarUrl}
      alt={UI_TEXT.media.avatar.alt}
      focalX={avatarFocalX}
      focalY={avatarFocalY}
      className="h-full w-full rounded-2xl object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-bg-input text-xs text-text-sec">
      {UI_TEXT.common.noPhoto}
    </div>
  );

  const previewPanel = (
    <div className="rounded-[36px] bg-[#0f0f0f] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
      <div className="rounded-[28px] bg-bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-2xl bg-bg-input">{previewAvatar}</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-main">{previewName}</div>
            <div className="mt-0.5 text-xs text-text-sec">{previewTagline}</div>
            <div className="mt-1 text-[11px] text-text-sec">
              ⭐ {data?.master.ratingAvg.toFixed(1)} · {data?.master.ratingCount}{" "}
              {UI_TEXT.master.profile.preview.reviewsLabel}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-bg-input/70 p-3 text-xs text-text-sec">
          <div className="text-[11px] font-medium uppercase text-text-sec">
            {UI_TEXT.master.profile.preview.addressLabel}
          </div>
          <div className="mt-1 text-sm text-text-main">{previewAddress}</div>
        </div>

        <div className="mt-3 text-xs text-text-sec">
          {previewBio || UI_TEXT.master.profile.preview.bioFallback}
        </div>

        <div
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${
            isPublished ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${isPublished ? "bg-emerald-400" : "bg-rose-400"}`} />
          {isPublished ? UI_TEXT.master.profile.preview.published : UI_TEXT.master.profile.preview.unpublished}
        </div>
      </div>
    </div>
  );

  const closeBookingConfig = useCallback(() => {
    setBookingConfigServiceId(null);
    setBookingConfigDraft(null);
    setBookingConfigError(null);
  }, []);

  const addBookingQuestion = useCallback(() => {
    setBookingConfigDraft((current) => {
      if (!current) return current;
      if (current.questions.length >= 5) return current;
      return {
        ...current,
        questions: [
          ...current.questions,
          {
            tempId: buildTempId("question"),
            text: "",
            required: false,
            order: current.questions.length,
          },
        ],
      };
    });
  }, []);

  const updateBookingQuestion = useCallback((tempId: string, patch: Partial<BookingQuestionDraft>) => {
    setBookingConfigDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.map((question) =>
          question.tempId === tempId ? { ...question, ...patch } : question
        ),
      };
    });
  }, []);

  const removeBookingQuestion = useCallback((tempId: string) => {
    setBookingConfigDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        questions: current.questions.filter((question) => question.tempId !== tempId),
      };
    });
  }, []);

  const moveBookingQuestion = useCallback((index: number, direction: -1 | 1) => {
    setBookingConfigDraft((current) => {
      if (!current) return current;
      const next = [...current.questions];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return {
        ...current,
        questions: next.map((question, idx) => ({ ...question, order: idx })),
      };
    });
  }, []);

  const saveBookingConfig = useCallback(async () => {
    if (!bookingConfigServiceId || !bookingConfigDraft) return;
    setBookingConfigSaving(true);
    setBookingConfigError(null);
    try {
      const payload = {
        requiresReferencePhoto: bookingConfigDraft.requiresReferencePhoto,
        questions: bookingConfigDraft.questions.map((question, index) => ({
          id: question.id,
          text: question.text,
          required: question.required,
          order: index,
        })),
      };
      const res = await fetch(`/api/master/services/${bookingConfigServiceId}/booking-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{
        requiresReferencePhoto: boolean;
        questions: Array<{ id: string; text: string; required: boolean; order: number }>;
      }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      closeBookingConfig();
    } catch (err) {
      setBookingConfigError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadBookingConfig);
    } finally {
      setBookingConfigSaving(false);
    }
  }, [bookingConfigDraft, bookingConfigServiceId, closeBookingConfig]);

  if (loading || !data) {
    return (
      <div className="rounded-2xl bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.master.profile.loading}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {profileStatusText ? <div className={`text-xs ${profileStatusTone}`}>{profileStatusText}</div> : null}
      </header>

      {error ? <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}

      {pendingInvites.length > 0 ? (
        <div className="rounded-2xl bg-amber-500/10 p-4">
          <h3 className="text-sm font-semibold text-amber-200">{UI_TEXT.master.profile.invite.title}</h3>
          <p className="mt-1 text-xs text-amber-200/80">{UI_TEXT.master.profile.invite.description}</p>
          <div className="mt-3">
            <StudioInviteCards invites={pendingInvites} onChanged={setPendingInvites} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-bg-card/70 p-2 lg:flex-col lg:p-3">
          {PROFILE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;

  return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
                  isActive ? "bg-bg-input text-text-main shadow-card" : "text-text-sec hover:text-text-main"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {activeTab === "main" ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                <div className="rounded-2xl bg-bg-card/90 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.sections.profileShowcaseTitle}</h3>
                      <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.sections.profileShowcaseDesc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-sec transition hover:text-text-main lg:hidden"
                    >
                      {UI_TEXT.master.profile.preview.openAsClient}
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-bg-input">
                        {avatarUrl ? (
                          <FocalImage
                            src={avatarUrl}
                            alt={UI_TEXT.media.avatar.alt}
                            focalX={avatarFocalX}
                            focalY={avatarFocalY}
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-text-sec">
                            {UI_TEXT.common.noPhoto}
                          </div>
                        )}
                        <div className="absolute right-1 top-1 flex gap-1">
                          <button
                            type="button"
                            onClick={openAvatarFileDialog}
                            className="rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
                            aria-label={UI_TEXT.master.profile.form.replaceAvatarAria}
                          >
                            ✏️
                          </button>
                          {avatarAssetId ? (
                            <button
                              type="button"
                              onClick={() => void deleteAvatar()}
                              className="rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
                              aria-label={UI_TEXT.master.profile.form.removeAvatarAria}
                            >
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

                      <div className="flex flex-col gap-2 text-xs text-text-sec">
                        <button
                          type="button"
                          onClick={openAvatarFileDialog}
                          className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-left text-sm text-text-main transition hover:bg-bg-card"
                        >
                          {UI_TEXT.master.profile.form.replaceAvatarAction}
                        </button>
                        {avatarAssetId ? (
                          <button
                            type="button"
                            onClick={() => void deleteAvatar()}
                            className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-left text-sm text-rose-400 transition hover:bg-bg-card"
                          >
                            {UI_TEXT.master.profile.form.removeAvatarAction}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.form.nameLabel}
                        <input
                          className={`${inputBaseClass} ${profileFieldErrors.displayName ? inputErrorClass : ""}`}
                          value={displayName}
                          onChange={(event) => {
                            setDisplayName(event.target.value);
                            if (event.target.value.trim()) {
                              setProfileFieldErrors({});
                            }
                          }}
                          onBlur={() => {
                            if (!displayName.trim()) {
                              setProfileFieldErrors({ displayName: UI_TEXT.master.profile.errors.displayNameRequired });
                            }
                          }}
                          placeholder={UI_TEXT.master.profile.form.namePlaceholder}
                        />
                        {profileFieldErrors.displayName ? (
                          <div className="mt-1 text-xs text-rose-400">{profileFieldErrors.displayName}</div>
                        ) : null}
                      </label>

                      <label className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.form.taglineLabel}
                        <input
                          className={inputBaseClass}
                          value={tagline}
                          onChange={(event) => setTagline(event.target.value)}
                          placeholder={UI_TEXT.master.profile.form.taglinePlaceholder}
                        />
                      </label>
                    </div>

                    <div ref={addressSuggestRootRef} className="relative">
                      <label className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.form.addressLabel}
                        <textarea
                          ref={addressInputRef}
                          className={inputBaseClass}
                          value={addressText}
                          rows={2}
                          onChange={(event) => {
                            handleAddressChange(event.target.value);
                            setError(null);
                          }}
                          onKeyDown={handleAddressKeyDown}
                          onFocus={() => {
                            if (addressSuggestions.length > 0) {
                              setIsAddressSuggestOpen(true);
                            }
                          }}
                          onBlur={() => {
                            setIsAddressSuggestOpen(false);
                          }}
                          placeholder={UI_TEXT.master.profile.form.addressPlaceholder}
                        />
                      </label>
                      {isAddressSuggestOpen && addressSuggestions.length > 0 ? (
                        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-card">
                          {addressSuggestions.map((item, index) => (
                            <button
                              type="button"
                              key={`${item.value}-${index}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setAddressSuggestIndex(index)}
                              onClick={() => selectAddressSuggestion(item)}
                              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-bg-input ${
                                index === addressSuggestIndex ? "bg-bg-input" : ""
                              }`}
                              aria-label={`${UI_TEXT.master.profile.form.selectAddressAria} ${item.value}`}
                            >
                              <span className="whitespace-normal break-words">{item.value}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {addressStatus ? (
                        <div className={`mt-1 text-xs ${addressStatusTone}`}>{addressStatus.text}</div>
                      ) : null}
                    </div>

                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.form.bioLabel}
                      <textarea
                        className={inputBaseClass}
                        value={bio}
                        rows={4}
                        onChange={(event) => setBio(event.target.value)}
                        placeholder={UI_TEXT.master.profile.form.bioPlaceholder}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl bg-bg-card/90 p-4">
                  <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.publication.title}</h3>
                  <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.publication.desc}</p>
                  <label className="mt-3 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isPublished}
                      onChange={(event) => setIsPublished(event.target.checked)}
                    />
                    {UI_TEXT.master.profile.publication.publishAction}
                  </label>
                </div>
              </div>

              <aside className="sticky top-6 hidden lg:block">
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.master.profile.preview.title}</div>
                {previewPanel}
              </aside>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.sections.settingsTitle}</h3>
                <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.sections.settingsDesc}</p>
              </div>
              <PublicUsernameCard endpoint="/api/cabinet/master/public-username" />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.master.isSolo ? (
                  <div className="rounded-2xl bg-bg-card/90 p-4">
                    <h4 className="text-sm font-semibold">{UI_TEXT.master.profile.automation.title}</h4>
                    <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.automation.desc}</p>
                    <div className="mt-3 rounded-xl bg-bg-input/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{UI_TEXT.master.profile.automation.autoConfirmTitle}</div>
                          <div className="mt-1 text-xs text-text-sec">
                            {UI_TEXT.master.profile.automation.autoConfirmDesc}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={autoConfirmBookings ?? false}
                            disabled={autoConfirmLoading || autoConfirmSaving}
                            onChange={(event) => void updateAutoConfirm(event.target.checked)}
                          />
                          {autoConfirmLoading
                            ? UI_TEXT.status.loading
                            : autoConfirmBookings
                              ? UI_TEXT.status.enabled
                              : UI_TEXT.status.disabled}
                        </label>
                      </div>
                    </div>
                  </div>
                  ) : null}

                {data.master.isSolo ? (
                <div className="rounded-2xl bg-bg-card/90 p-4">
                  <h4 className="text-sm font-semibold">{UI_TEXT.master.profile.reminders.title}</h4>
                  <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.reminders.desc}</p>
                  <div className="mt-3 rounded-xl bg-bg-input/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{UI_TEXT.master.profile.reminders.label}</div>
                        <div className="mt-1 text-xs text-text-sec">
                          {UI_TEXT.master.profile.reminders.hint}
                        </div>
                      </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={remindersEnabled ?? false}
                            disabled={autoConfirmLoading || remindersSaving}
                            onChange={(event) => void updateRemindersEnabled(event.target.checked)}
                          />
                          {remindersSaving
                            ? UI_TEXT.status.saving
                            : remindersEnabled
                            ? UI_TEXT.status.enabled
                            : UI_TEXT.status.disabled}
                        </label>
                      </div>
                    </div>
                  </div>
                  ) : null}

                {data.master.isSolo ? (
                  <div className="rounded-2xl bg-bg-card/90 p-4">
                    <h4 className="text-sm font-semibold">{UI_TEXT.master.profile.cancellation.title}</h4>
                    <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.cancellation.desc}</p>
                    <div className="mt-3 rounded-xl bg-bg-input/70 p-3">
                      <label className="block text-xs text-text-sec">{UI_TEXT.master.profile.cancellation.label}</label>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <input
                          type="number"
                          min={0}
                          max={168}
                          inputMode="numeric"
                          value={cancellationDeadlineInput}
                          onChange={(event) => setCancellationDeadlineInput(event.target.value)}
                          disabled={autoConfirmLoading || cancellationDeadlineSaving}
                          placeholder={UI_TEXT.master.profile.cancellation.placeholder}
                          className="h-10 w-[160px] rounded-xl border border-border-subtle bg-bg-card px-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <button
                          type="button"
                          onClick={() => void saveCancellationDeadline()}
                          disabled={autoConfirmLoading || cancellationDeadlineSaving}
                          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                        >
                          {cancellationDeadlineSaving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-text-sec">
                        {UI_TEXT.master.profile.cancellation.currentValue}{" "}
                        {cancellationDeadlineHours === null
                          ? UI_TEXT.common.noLimit
                          : `${cancellationDeadlineHours} ${UI_TEXT.master.profile.cancellation.hoursShort}`}
                      </div>
                    </div>
                  </div>
                  ) : null}

                  <ConnectedAccountsSection />
                  <FeatureGate
                    feature="hotSlots"
                    requiredPlan="PREMIUM"
                    scope="MASTER"
                    title={UI_TEXT.master.profile.hotSlots.title}
                    description={UI_TEXT.master.profile.hotSlots.desc}
                  >
                    <HotSlotsSettingsSection services={serviceList} />
                  </FeatureGate>
                </div>
              <section className="mt-12 border-t border-red-200/40 pt-8">
                <h2 className="text-sm font-semibold text-red-500">{UI_TEXT.master.profile.deleteCabinet.title}</h2>
                <p className="mt-1 text-xs text-text-sec">
                  {UI_TEXT.master.profile.deleteCabinet.descMain} {UI_TEXT.master.profile.deleteCabinet.descLegal}
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
                  {UI_TEXT.master.profile.deleteCabinet.action}
                </button>
              </section>
              </div>
            ) : null}

          {activeTab === "services" ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.sections.servicesTitle}</h3>
                  <p className="mt-1 text-xs text-text-sec">
                    {UI_TEXT.master.profile.sections.servicesDesc}
                  </p>
                </div>
                {autosaveInfo ? <div className="text-xs text-text-sec">{autosaveInfo}</div> : null}
              </div>

        {showAddServicePanel ? (
          <div className="rounded-2xl bg-bg-card/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">{UI_TEXT.master.profile.services.newServiceTitle}</h4>
              <button
                type="button"
                onClick={() => setShowAddServicePanel(false)}
                className="text-xs text-text-sec"
              >
                {UI_TEXT.master.profile.services.hide}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {data.master.isSolo ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.globalCategoryLabel}
                      <select
                        value={newSoloServiceGlobalCategoryId}
                        onChange={(event) => setNewSoloServiceGlobalCategoryId(event.target.value)}
                        className={selectBaseClass}
                      >
                        <option value="">{UI_TEXT.master.profile.services.selectCategory}</option>
                        {globalCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.icon ? `${category.icon} ` : ""}{category.fullPath || category.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!newSoloServiceGlobalCategoryId ? (
                      <div className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.services.selectCategoryHint}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_140px_150px]">
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.serviceTitleLabel}
                      <input
                        type="text"
                        value={newSoloServiceTitle}
                        onChange={(event) => {
                          setNewSoloServiceTitle(event.target.value);
                          setNewSoloServiceFieldErrors((current) => ({ ...current, title: undefined }));
                        }}
                        className={`${inputBaseClass} ${newSoloServiceFieldErrors.title ? inputErrorClass : ""}`}
                        placeholder={UI_TEXT.master.profile.services.serviceTitlePlaceholder}
                      />
                    </label>
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.priceLabel}
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          value={newSoloServicePrice}
                          onChange={(event) => {
                            setNewSoloServicePrice(Number(event.target.value) || 0);
                            setNewSoloServiceFieldErrors((current) => ({ ...current, price: undefined }));
                          }}
                          onBlur={() =>
                            setNewSoloServicePrice((value) => (value > 0 ? normalizePrice(value) : value))
                          }
                          className={`${selectBaseClass} ${newSoloServiceFieldErrors.price ? inputErrorClass : ""}`}
                          placeholder="0"
                        />
                        <span className="text-xs text-text-sec">{UI_TEXT.common.currencyRub}</span>
                      </div>
                    </label>
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.durationLabel}
                      <div className="mt-1 flex items-center gap-2">
                        <select
                          value={newSoloServiceDuration}
                          onChange={(event) => {
                            setNewSoloServiceDuration(Number(event.target.value) || 0);
                            setNewSoloServiceFieldErrors((current) => ({ ...current, durationMin: undefined }));
                          }}
                          className={`${selectBaseClass} ${newSoloServiceFieldErrors.durationMin ? inputErrorClass : ""}`}
                        >
                          {SERVICE_DURATION_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-text-sec">{UI_TEXT.common.minutesShort}</span>
                      </div>
                    </label>
                  </div>
                  {newSoloServiceFieldErrors.title ||
                  newSoloServiceFieldErrors.price ||
                  newSoloServiceFieldErrors.durationMin ? (
                    <div className="text-xs text-rose-400">
                      {newSoloServiceFieldErrors.title ??
                        newSoloServiceFieldErrors.price ??
                        newSoloServiceFieldErrors.durationMin}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void createSoloService()}
                    disabled={saving}
                    className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main transition hover:bg-bg-card disabled:opacity-60"
                  >
                    {saving ? UI_TEXT.status.saving : UI_TEXT.master.profile.services.addService}
                  </button>
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    value={selectedStudioServiceId}
                    onChange={(event) => setSelectedStudioServiceId(event.target.value)}
                    className={selectBaseClass}
                  >
                    <option value="">{UI_TEXT.master.profile.services.selectStudioService}</option>
                    {disabledServices.map((service) => (
                      <option key={service.serviceId} value={service.serviceId}>
                        {service.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addStudioService}
                    className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main transition hover:bg-bg-card"
                  >
                    {UI_TEXT.actions.add}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-bg-card/90 p-4">
          <div className="grid grid-cols-[minmax(0,2fr)_150px_150px_90px] items-center gap-3 border-b border-border-subtle pb-2 text-xs text-text-sec">
            <div>{UI_TEXT.master.profile.services.columnTitle}</div>
            <div>{UI_TEXT.master.profile.services.columnPrice}</div>
            <div>{UI_TEXT.master.profile.services.columnDuration}</div>
            <div className="text-center">{UI_TEXT.master.profile.services.columnEnabled}</div>
          </div>
          <div className="divide-y divide-border-subtle">
            {serviceList.map((service) => {
              const durationOptions = buildDurationOptions(service.effectiveDurationMin);

  return (
                <div key={service.serviceId} className="grid grid-cols-[minmax(0,2fr)_150px_150px_90px] items-center gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-main">{service.title}</div>
                    {!service.canEditPrice ? (
                      <div className="mt-1 text-xs text-text-sec">
                        {UI_TEXT.master.profile.services.priceManagedHint}
                      </div>
                    ) : null}
                    {false && (
                      <>
                        {/* TODO: Online payments for services - not yet implemented */}
                        {showOnlinePaymentsToggle ? (
                          <label
                            className="mt-2 inline-flex items-center gap-2 text-xs text-text-sec"
                            title={onlinePaymentsLockedMessage ?? undefined}
                          >
                            <input
                              type="checkbox"
                              checked={service.onlinePaymentEnabled}
                              disabled={!canOnlinePayments}
                              onChange={(event) =>
                                setServicesDraft((current) => ({
                                  ...current,
                                  [service.serviceId]: {
                                    ...current[service.serviceId],
                                    onlinePaymentEnabled: event.target.checked,
                                  },
                                }))
                              }
                            />
                            {UI_TEXT.master.profile.services.onlinePaymentsLabel}
                          </label>
                        ) : null}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setBookingConfigServiceId(service.serviceId)}
                      className="mt-2 inline-flex text-xs font-medium text-primary underline"
                    >
                      {UI_TEXT.master.profile.bookingConfig.open}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className={`${selectBaseClass} ${
                        serviceFieldErrors[service.serviceId]?.price ? inputErrorClass : ""
                      }`}
                      value={service.effectivePrice}
                      disabled={!service.canEditPrice}
                      placeholder="0"
                      inputMode="numeric"
                      step={100}
                      min={0}
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
                            [service.serviceId]: {
                              ...current[service.serviceId],
                              price: UI_TEXT.master.profile.errors.priceTooLow,
                            },
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
                    <span className="text-xs text-text-sec">₽</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className={`${selectBaseClass} ${
                        serviceFieldErrors[service.serviceId]?.duration ? inputErrorClass : ""
                      }`}
                      value={service.effectiveDurationMin}
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
                    >
                      {durationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-text-sec">{UI_TEXT.common.minutesShort}</span>
                  </div>
                  <label className="flex items-center justify-center">
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
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddServicePanel(true)}
          className="w-full rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-3 text-sm text-text-main transition hover:bg-bg-card"
        >
          {UI_TEXT.master.profile.services.addServiceCta}
        </button>
      </div>
          ) : null}

          {activeTab === "portfolio" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">{UI_TEXT.master.profile.sections.portfolioTitle}</h3>
                <p className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.sections.portfolioDesc}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={portfolioLimitWarning ? "text-amber-600" : "text-text-sec"}>
                  {portfolioLimitLabel}
                </span>
                {portfolioLimitReached ? (
                  <span className="text-rose-400">
                    {UI_TEXT.master.profile.portfolio.limitReached}{" "}
                    <a href="/cabinet/billing?scope=MASTER" className="underline">
                      {UI_TEXT.master.profile.portfolio.plans}
                    </a>
                  </span>
                ) : null}
              </div>
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
              <div
                className={`flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center text-sm transition ${
                  dropActive ? "border-primary bg-primary/10" : "border-border-subtle bg-bg-card/80"
                } ${portfolioLimitReached ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                onClick={() => {
                  if (portfolioLimitReached) {
                    setError(UI_TEXT.master.profile.errors.portfolioLimitReached);
                    return;
                  }
                  newPortfolioInputRef.current?.click();
                }}
                onDragOver={handlePortfolioDragOver}
                onDragLeave={handlePortfolioDragLeave}
                onDrop={handlePortfolioDrop}
              >
                <div className="text-sm font-medium text-text-main">
                  {UI_TEXT.master.profile.portfolio.dropTitle}
                </div>
                <div className="mt-1 text-xs text-text-sec">
                  {UI_TEXT.master.profile.portfolio.dropSubtitle}{" "}
                  {saving ? UI_TEXT.master.profile.portfolio.uploadingSuffix : ""}
                </div>
              </div>

              {pendingPortfolioMeta ? (
                <div className="rounded-2xl bg-bg-card/90 p-4">
                  <div className="text-xs text-text-sec">{UI_TEXT.master.profile.portfolio.draftLabel}</div>
                  <img
                    src={pendingPortfolioMeta.mediaUrl}
                    alt={UI_TEXT.master.profile.portfolio.draftAlt}
                    className="mt-3 h-48 w-full rounded-2xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPortfolioMetaOpen(true)}
                    className="mt-3 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-main transition hover:bg-bg-card"
                  >
                    {UI_TEXT.master.profile.portfolio.addDescription}
                  </button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.portfolio.map((item) => {
                  const linkedServices = item.serviceIds
                    .map((id) => serviceTitleById.get(id))
                    .filter((value): value is string => Boolean(value));
                  const isBroken = brokenPortfolio[item.id];

  return (
                    <div key={item.id} className="relative overflow-hidden rounded-2xl bg-bg-card/90 p-3">
                      {isBroken ? (
                        <div className="flex h-40 w-full items-center justify-center rounded-xl bg-bg-input text-xs text-text-sec">
                          {UI_TEXT.master.profile.portfolio.photoUnavailable}
                        </div>
                      ) : (
                        <img
                          src={item.mediaUrl}
                          alt={item.caption ?? UI_TEXT.master.profile.portfolio.photoAlt}
                          className="h-40 w-full rounded-xl object-cover"
                          onError={() =>
                            setBrokenPortfolio((current) => ({
                              ...current,
                              [item.id]: true,
                            }))
                          }
                        />
                      )}

                      {!item.inSearch ? (
                        <button
                          type="button"
                          onClick={() => openPortfolioCategoryModal(item)}
                          title="Добавьте категорию чтобы фото появилось в поиске"
                          className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-white"
                        >
                          Не в поиске
                        </button>
                      ) : null}

                      <div className="absolute right-3 top-3 flex gap-2">
                        <label
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm text-white"
                          title={UI_TEXT.master.profile.portfolio.replace}
                        >
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
                        <button
                          type="button"
                          onClick={() => void removePortfolio(item)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                          title={UI_TEXT.master.profile.portfolio.remove}
                        >
                          ✖️
                        </button>
                      </div>

                      {item.caption ? <div className="mt-2 text-xs text-text-sec">{item.caption}</div> : null}
                      <div className="mt-2 text-xs text-text-sec">{UI_TEXT.master.profile.portfolio.linkedServices}</div>
                      {linkedServices.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {linkedServices.map((title) => (
                            <span
                              key={`${item.id}-${title}`}
                              className="rounded-full bg-bg-input px-2 py-0.5 text-[11px] text-text-main"
                            >
                              {title}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-text-sec">{UI_TEXT.common.notSpecified}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {bookingConfigServiceId ? (
        <ModalSurface open onClose={closeBookingConfig} title={UI_TEXT.master.profile.bookingConfig.title}>
          <div className="space-y-4">
            {bookingConfigLoading ? (
              <div className="text-sm text-text-sec">{UI_TEXT.master.profile.bookingConfig.loading}</div>
            ) : null}
            {bookingConfigError ? <div className="text-sm text-rose-400">{bookingConfigError}</div> : null}

            {bookingConfigDraft ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={bookingConfigDraft.requiresReferencePhoto}
                    onChange={(event) =>
                      setBookingConfigDraft((current) =>
                        current
                          ? { ...current, requiresReferencePhoto: event.target.checked }
                          : current
                      )
                    }
                  />
                  {UI_TEXT.master.profile.bookingConfig.referencePhotoRequiredLabel}
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{UI_TEXT.master.profile.bookingConfig.questionsTitle}</div>
                    <button
                      type="button"
                      onClick={addBookingQuestion}
                      disabled={bookingConfigDraft.questions.length >= 5}
                      className="rounded-lg border border-border-subtle bg-bg-input px-3 py-1 text-xs text-text-main transition hover:bg-bg-card disabled:opacity-60"
                    >
                      {UI_TEXT.master.profile.bookingConfig.addQuestion}
                    </button>
                  </div>

                  {bookingConfigDraft.questions.length === 0 ? (
                    <div className="text-xs text-text-sec">{UI_TEXT.master.profile.bookingConfig.empty}</div>
                  ) : null}

                  {bookingConfigDraft.questions.map((question, index) => (
                    <div key={question.tempId} className="rounded-xl border border-border-subtle bg-bg-input/70 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <label className="block text-xs text-text-sec">
                            {UI_TEXT.master.profile.bookingConfig.questionLabel} {index + 1}
                          </label>
                          <input
                            type="text"
                            value={question.text}
                            onChange={(event) =>
                              updateBookingQuestion(question.tempId, { text: event.target.value })
                            }
                            className="mt-2 w-full rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-sm text-text-main outline-none"
                            placeholder={UI_TEXT.master.profile.bookingConfig.questionPlaceholder}
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => moveBookingQuestion(index, -1)}
                            disabled={index === 0}
                            className="rounded-lg border border-border-subtle bg-bg-card px-2 py-1 disabled:opacity-40"
                          >
                            {UI_TEXT.master.profile.bookingConfig.moveUp}
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBookingQuestion(index, 1)}
                            disabled={index === bookingConfigDraft.questions.length - 1}
                            className="rounded-lg border border-border-subtle bg-bg-card px-2 py-1 disabled:opacity-40"
                          >
                            {UI_TEXT.master.profile.bookingConfig.moveDown}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBookingQuestion(question.tempId)}
                            className="rounded-lg border border-border-subtle bg-bg-card px-2 py-1 text-rose-500"
                          >
                            {UI_TEXT.master.profile.bookingConfig.remove}
                          </button>
                        </div>
                      </div>
                      <label className="mt-2 inline-flex items-center gap-2 text-xs text-text-sec">
                        <input
                          type="checkbox"
                          checked={question.required}
                          onChange={(event) =>
                            updateBookingQuestion(question.tempId, { required: event.target.checked })
                          }
                        />
                        {UI_TEXT.master.profile.bookingConfig.required}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeBookingConfig}
                className="rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm text-text-main"
              >
                {UI_TEXT.actions.close}
              </button>
              <button
                type="button"
                onClick={() => void saveBookingConfig()}
                disabled={bookingConfigSaving || bookingConfigLoading || !bookingConfigDraft}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {bookingConfigSaving ? UI_TEXT.status.saving : UI_TEXT.status.saved}
              </button>
            </div>
          </div>
        </ModalSurface>
      ) : null}

{previewOpen ? (
        <ModalSurface
          open
          onClose={() => setPreviewOpen(false)}
          title={UI_TEXT.master.profile.portfolioMeta.modalTitle}
        >
          <div className="flex justify-center">{previewPanel}</div>
        </ModalSurface>
      ) : null}

      {portfolioCategoryTarget ? (
        <ModalSurface
          open
          onClose={() => {
            if (!portfolioCategorySaving) {
              setPortfolioCategoryTarget(null);
              setPortfolioCategoryDraft("");
            }
          }}
          title="Категория фото"
        >
          <div className="space-y-3">
            <select
              value={portfolioCategoryDraft}
              onChange={(event) => setPortfolioCategoryDraft(event.target.value)}
              className={selectBaseClass}
              disabled={portfolioCategorySaving}
            >
              <option value="">Без категории</option>
              {globalCategories.map((category) => (
                <option key={`portfolio-category-${category.id}`} value={category.id}>
                  {category.icon ? `${category.icon} ` : ""}
                  {category.fullPath || category.title}
                </option>
              ))}
            </select>
            <div className="text-xs text-text-sec">
              Добавьте категорию чтобы фото появилось в поиске
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPortfolioCategoryTarget(null);
                  setPortfolioCategoryDraft("");
                }}
                disabled={portfolioCategorySaving}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </button>
              <button
                type="button"
                onClick={() => void savePortfolioCategory()}
                disabled={portfolioCategorySaving}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
              >
                {portfolioCategorySaving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
              </button>
            </div>
          </div>
        </ModalSurface>
      ) : null}

      {portfolioMetaOpen && pendingPortfolioMeta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-bg-card p-4">
            <h3 className="text-base font-semibold">{UI_TEXT.master.profile.portfolioMeta.photoDescriptionTitle}</h3>
            <div className="mt-3 space-y-2">
              <input
                className={inputBaseClass}
                value={portfolioCaption}
                onChange={(event) => setPortfolioCaption(event.target.value)}
                placeholder={UI_TEXT.master.profile.portfolioMeta.captionPlaceholder}
              />
              <div className="space-y-1">
                <select
                  value={portfolioGlobalCategoryId}
                  onChange={(event) => {
                    setPortfolioGlobalCategoryId(event.target.value);
                    setPortfolioServiceId("");
                  }}
                  className={selectBaseClass}
                >
                  <option value="">{"\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)"}</option>
                  {portfolioCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {!portfolioGlobalCategoryId ? (
                  <div className="text-xs text-text-sec">
                    Если категорию не выбрать, фото сохранится, но может не попасть в поиск сразу.
                  </div>
                ) : null}
              </div>
              {portfolioGlobalCategoryId ? (
                <div className="space-y-1">
                  <select
                    value={portfolioServiceId}
                    onChange={(event) => setPortfolioServiceId(event.target.value)}
                    className={selectBaseClass}
                  >
                    <option value="">{"\u0423\u0441\u043b\u0443\u0433\u0430 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)"}</option>
                    {portfolioFilteredServices.map((service) => (
                      <option key={`portfolio-service-${service.serviceId}`} value={service.serviceId}>
                        {service.title} - {service.effectiveDurationMin} {"\u043c\u0438\u043d"}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-text-sec">{UI_TEXT.master.profile.portfolioMeta.serviceHint}</div>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPortfolioMetaOpen(false);
                  setPortfolioServiceId("");
                  setPortfolioGlobalCategoryId("");
                }}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </button>
              <button
                type="button"
                onClick={() => void commitPendingPortfolio()}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
              >
                {UI_TEXT.actions.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    <DeleteCabinetModal
      open={deleteModalOpen}
      type="master"
      onCancel={() => setDeleteModalOpen(false)}
      onConfirm={handleDeleteMaster}
      loading={deleteLoading}
      activeBookingsCount={deleteActiveCount}
      error={deleteError}
    />
    </section>
  );
}

