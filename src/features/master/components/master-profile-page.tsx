/* eslint-disable @next/next/no-img-element -- cabinet portfolio management with inline editing */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, Sparkles, Trash2 } from "lucide-react";
import { DeleteCabinetModal } from "@/components/deletion/DeleteCabinetModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FocalImage } from "@/components/ui/focal-image";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import { ShareProfileSection } from "@/features/cabinet/components/share-profile-section";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import {
  useAddressWithGeocode,
} from "@/lib/maps/use-address-with-geocode";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";

type MasterServiceItem = {
  serviceId: string;
  title: string;
  description: string | null;
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
  name?: string;
  title: string;
  slug: string;
  icon: string | null;
  parentId?: string | null;
  depth?: number;
  fullPath?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  isPersonal?: boolean;
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

const MIN_SERVICE_DURATION_MIN = 15;
const MAX_SERVICE_DURATION_MIN = 12 * 60;
const SERVICE_DURATION_STEP_MIN = 15;
const SERVICE_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const SAVE_ADDRESS_ERROR_MESSAGE = UI_TEXT.master.profile.errors.saveAddress;

function buildDurationOptions(value: number): number[] {
  if (!Number.isFinite(value) || value <= 0) return SERVICE_DURATION_OPTIONS;
  return SERVICE_DURATION_OPTIONS.includes(value) ? SERVICE_DURATION_OPTIONS : [value, ...SERVICE_DURATION_OPTIONS];
}

function formatCategoryOptionLabel(category: GlobalCategoryOption): string {
  const base = category.fullPath || category.title || category.name || "";
  const pendingSuffix =
    category.status === "PENDING" ? UI_TEXT.master.profile.services.categoryPendingSuffix : "";
  const personalSuffix =
    category.isPersonal ? UI_TEXT.master.profile.services.categoryPersonalSuffix : "";
  return `${category.icon ? `${category.icon} ` : ""}${base}${pendingSuffix}${personalSuffix}`;
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
  fallback: string = SAVE_ADDRESS_ERROR_MESSAGE
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

  const res = await fetchWithAuth("/api/media", { method: "POST", body: formData });
  const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
  if (!res.ok || !json || !json.ok) {
    throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
  }
  return json.data.asset;
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
      <div className="rounded-2xl bg-white/4">{children}</div>
    </section>
  );
}

function SectionDivider() {
  return <div className="h-px bg-white/6" />;
}

function LockedFeatureRow({
  title,
  hint,
  children,
  hasAccess,
  showUpgradeTip,
  onUpgradeClick,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  hasAccess: boolean;
  showUpgradeTip: boolean;
  onUpgradeClick: () => void;
}) {
  return (
    <div
      className={[
        "relative flex items-center justify-between gap-3 p-4 transition-colors",
        hasAccess ? "" : "opacity-60",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1 pr-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {!hasAccess ? (
            <span className="rounded-full bg-[#c6a97e]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c6a97e]">
              PRO
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-text-sec">{hint}</p>
      </div>

      <div onClick={!hasAccess ? onUpgradeClick : undefined} className={!hasAccess ? "cursor-pointer" : ""}>
        {hasAccess ? children : <div className="pointer-events-none">{children}</div>}
      </div>

      {!hasAccess && showUpgradeTip ? (
        <div className="absolute right-4 top-full z-10 mt-1 w-56 rounded-xl bg-bg-elevated p-3 shadow-xl">
          <p className="text-xs font-medium">{UI_TEXT.settings.billing.featureGate.title}</p>
          <p className="mt-1 text-xs text-text-sec">{UI_TEXT.settings.billing.featureGate.hint}</p>
          <Link
            href="/cabinet/master/billing"
            className="mt-2 block rounded-lg bg-primary px-3 py-1.5 text-center text-xs font-semibold text-white"
          >
            {UI_TEXT.settings.billing.featureGate.cta}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function MasterProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = usePlanFeatures("MASTER");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteActiveCount, setDeleteActiveCount] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [leaveStudioModalOpen, setLeaveStudioModalOpen] = useState(false);
  const [leaveStudioTransferServices, setLeaveStudioTransferServices] = useState(true);
  const [leaveStudioLoading, setLeaveStudioLoading] = useState(false);
  const [leaveStudioError, setLeaveStudioError] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<NotificationCenterInviteItem[]>([]);
  const [autoConfirmBookings, setAutoConfirmBookings] = useState<boolean | null>(null);
  const [autoConfirmLoading, setAutoConfirmLoading] = useState(false);
  const [autoConfirmSaving, setAutoConfirmSaving] = useState(false);
  const [cancellationDeadlineHours, setCancellationDeadlineHours] = useState<number | null>(null);
  const [cancellationDeadlineInput, setCancellationDeadlineInput] = useState("");
  const [cancellationDeadlineSaving, setCancellationDeadlineSaving] = useState(false);
  const [cancellationSaved, setCancellationSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("main");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [servicesSaveStatus, setServicesSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileFieldErrors, setProfileFieldErrors] = useState<{ displayName?: string }>({});
  const [upgradeTipKey, setUpgradeTipKey] = useState<"telegram" | "vk" | "hotSlots" | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
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
  const [proposeCategoryOpen, setProposeCategoryOpen] = useState(false);
  const [proposeCategoryTitle, setProposeCategoryTitle] = useState("");
  const [proposeCategorySaving, setProposeCategorySaving] = useState(false);
  const [proposeCategoryMessage, setProposeCategoryMessage] = useState<string | null>(null);
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

  const [suggestingDescriptionId, setSuggestingDescriptionId] = useState<string | null>(null);

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
  const servicesSavingRef = useRef(false);
  const servicesPendingRef = useRef(false);
  const servicesSnapshotRef = useRef<MasterServiceItem[]>([]);
  const cancellationSavedTimeoutRef = useRef<number | null>(null);
  const upgradeTipTimeoutRef = useRef<number | null>(null);

  const loadCategoryOptions = useCallback(async (): Promise<void> => {
    try {
      const categoriesRes = await fetchWithAuth("/api/catalog/global-categories", { cache: "no-store" });
      const categoriesJson = (await categoriesRes.json().catch(() => null)) as
        | ApiResponse<{ categories: GlobalCategoryOption[] } | GlobalCategoryOption[]>
        | null;

      const items = categoriesRes.ok && categoriesJson && categoriesJson.ok
        ? (Array.isArray(categoriesJson.data) ? categoriesJson.data : categoriesJson.data.categories)
        : [];

      const merged = items
        .map((category) => ({
          ...category,
          title: category.title || category.name || "",
          isPersonal: category.isPersonal ?? false,
        }))
        .filter((category) => category.id && (category.title || category.name))
        .sort((a, b) =>
          (a.fullPath || a.title || a.name || "").localeCompare(b.fullPath || b.title || b.name || "", "ru")
        );

      setGlobalCategories(merged);
    } catch {
      setGlobalCategories([]);
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/master/profile", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<MasterProfileData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      const profileData = json.data;
      const hasCoords =
        typeof profileData.master.geoLat === "number" &&
        Number.isFinite(profileData.master.geoLat) &&
        typeof profileData.master.geoLng === "number" &&
        Number.isFinite(profileData.master.geoLng);
      const coords = hasCoords ? { lat: profileData.master.geoLat!, lng: profileData.master.geoLng! } : null;

      servicesSnapshotRef.current = profileData.services;
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

      await loadCategoryOptions();

      const [avatarRes, portfolioRes] = await Promise.all([
        fetchWithAuth(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=AVATAR`, { cache: "no-store" }),
        fetchWithAuth(`/api/media?entityType=MASTER&entityId=${encodeURIComponent(profileData.master.id)}&kind=PORTFOLIO`, { cache: "no-store" }),
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

      setServicesSaveStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.loadProfile);
    } finally {
      setLoading(false);
    }
  }, [loadCategoryOptions, setAddressSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!data) return;
    const hasChanges =
      displayName.trim() !== data.master.displayName ||
      tagline.trim() !== data.master.tagline ||
      addressText.trim() !== data.master.address.trim() ||
      bio.trim() !== (data.master.bio ?? "").trim() ||
      (avatarUrl.trim() || null) !== ((data.master.avatarUrl ?? "").trim() || null);
    if (hasChanges && profileSaveStatus !== "saving") {
      setProfileSaveStatus("idle");
    }
  }, [addressText, avatarUrl, bio, data, displayName, profileSaveStatus, tagline]);

  useEffect(() => {
    servicesSnapshotRef.current = Object.values(servicesDraft);
  }, [servicesDraft]);

  useEffect(() => {
    return () => {
      if (cancellationSavedTimeoutRef.current !== null) {
        window.clearTimeout(cancellationSavedTimeoutRef.current);
      }
      if (upgradeTipTimeoutRef.current !== null) {
        window.clearTimeout(upgradeTipTimeoutRef.current);
      }
    };
  }, []);

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
        const res = await fetchWithAuth(`/api/master/services/${bookingConfigServiceId}/booking-config`, { cache: "no-store" });
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
      setCancellationDeadlineHours(null);
      setCancellationDeadlineInput("");
      return;
    }

    const controller = new AbortController();
    setAutoConfirmLoading(true);
    void (async () => {
      try {
        const res = await fetchWithAuth("/api/providers/me/settings", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{
              autoConfirmBookings: boolean;
              cancellationDeadlineHours: number | null;
            }>
          | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setAutoConfirmBookings(json.data.autoConfirmBookings);
        const deadlineValue = json.data.cancellationDeadlineHours ?? null;
        setCancellationDeadlineHours(deadlineValue);
        setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAutoConfirmBookings(null);
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
        const res = await fetchWithAuth("/api/notifications/center", { cache: "no-store" });
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
      const res = await fetchWithAuth("/api/cabinet/master/delete", { method: "DELETE" });
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

  const handleLeaveStudio = async (): Promise<void> => {
    setLeaveStudioLoading(true);
    setLeaveStudioError(null);
    try {
      const res = await fetchWithAuth("/api/cabinet/master/leave-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferServices: leaveStudioTransferServices }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ transferredServices: number }>
        | null;
      if (!res.ok || !json || !json.ok) {
        setLeaveStudioError(
          json && !json.ok ? json.error.message : `${UI_TEXT.master.profile.errors.apiErrorPrefix} ${res.status}`
        );
        return;
      }

      setLeaveStudioModalOpen(false);
      router.push("/cabinet/master/profile");
      router.refresh();
      await load();
    } catch (err) {
      setLeaveStudioError(
        err instanceof Error ? err.message : UI_TEXT.master.profile.errors.leaveStudio
      );
    } finally {
      setLeaveStudioLoading(false);
    }
  };

  const openLeaveStudioModal = useCallback(() => {
    setLeaveStudioError(null);
    setLeaveStudioTransferServices(true);
    setLeaveStudioModalOpen(true);
  }, []);

  const serviceList = useMemo(() => Object.values(servicesDraft), [servicesDraft]);
  const hasServiceDraftChanges = useMemo(() => {
    if (!data) return false;
    if (serviceList.length !== data.services.length) return true;
    const baseById = new Map(data.services.map((service) => [service.serviceId, service]));
    for (const service of serviceList) {
      const base = baseById.get(service.serviceId);
      if (!base) return true;
      if (service.isEnabled !== base.isEnabled) return true;
      if (service.globalCategoryId !== base.globalCategoryId) return true;
      if (service.durationOverrideMin !== base.durationOverrideMin) return true;
      if (service.effectiveDurationMin !== base.effectiveDurationMin) return true;
      if (service.priceOverride !== base.priceOverride) return true;
      if (service.effectivePrice !== base.effectivePrice) return true;
      if (service.onlinePaymentEnabled !== base.onlinePaymentEnabled) return true;
    }
    return false;
  }, [data, serviceList]);
  const disabledServices = useMemo(
    () => serviceList.filter((service) => !service.isEnabled),
    [serviceList]
  );
  const pendingCategoryTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of globalCategories) {
      if (category.status !== "PENDING") continue;
      const title = (category.fullPath || category.title || category.name || "").trim();
      if (!title) continue;
      map.set(category.id, title);
    }
    return map;
  }, [globalCategories]);
  const pendingServiceCategoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const service of serviceList) {
      if (!service.globalCategoryId) continue;
      const title = pendingCategoryTitleById.get(service.globalCategoryId);
      if (title) names.add(title);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }, [pendingCategoryTitleById, serviceList]);
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
  const hasTelegramAccess = plan.can("notifications") && plan.can("tgNotifications");
  const hasVkAccess = plan.can("notifications") && plan.can("vkNotifications");
  const hasHotSlotsAccess = plan.can("hotSlots");
  const onlinePaymentsLockedMessage = !onlinePaymentsAllowed
    ? UI_TEXT.master.profile.onlinePayments.proRequired
    : !onlinePaymentsSystemEnabled
      ? UI_TEXT.master.profile.onlinePayments.disabledByAdmin
      : null;

  const handleUpgradeClick = useCallback((key: "telegram" | "vk" | "hotSlots") => {
    setUpgradeTipKey(key);
    if (upgradeTipTimeoutRef.current !== null) {
      window.clearTimeout(upgradeTipTimeoutRef.current);
    }
    upgradeTipTimeoutRef.current = window.setTimeout(() => {
      setUpgradeTipKey((current) => (current === key ? null : current));
      upgradeTipTimeoutRef.current = null;
    }, 3000);
  }, []);

  function normalizePrice(value: number): number {
    return Math.ceil(value / 100) * 100;
  }

  function normalizeDuration(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return MIN_SERVICE_DURATION_MIN;
    const clamped = Math.min(MAX_SERVICE_DURATION_MIN, Math.max(MIN_SERVICE_DURATION_MIN, value));
    return Math.round(clamped / SERVICE_DURATION_STEP_MIN) * SERVICE_DURATION_STEP_MIN;
  }

  const saveProfile = useCallback(async (): Promise<boolean> => {
    if (!data) return false;

    setProfileFieldErrors({});
    setError(null);

    const currentMaster = data.master;
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

    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      setProfileFieldErrors({ displayName: UI_TEXT.master.profile.errors.displayNameRequired });
      setProfileSaveStatus("error");
      return false;
    }
    if (nextDisplayName !== currentMaster.displayName) {
      payload.displayName = nextDisplayName;
    }

    const nextTagline = tagline.trim();
    if (nextTagline !== currentMaster.tagline) {
      payload.tagline = nextTagline;
    }

    const nextAddress = addressText.trim();
    const currentAddress = currentMaster.address.trim();
    const addressChanged = nextAddress !== currentAddress;

    const nextBio = bio.trim();
    const currentBio = (currentMaster.bio ?? "").trim();
    if (nextBio !== currentBio) {
      payload.bio = nextBio;
    }

    const nextAvatarUrl = avatarUrl.trim() || null;
    const currentAvatarUrl = (currentMaster.avatarUrl ?? "").trim() || null;
    if (nextAvatarUrl !== currentAvatarUrl) {
      payload.avatarUrl = nextAvatarUrl;
    }

    if (isPublished !== currentMaster.isPublished) {
      payload.isPublished = isPublished;
    }

    const nextCoords =
      addressCoords && Number.isFinite(addressCoords.lat) && Number.isFinite(addressCoords.lng)
        ? addressCoords
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

    if (addressChanged) {
      if (!nextAddress) {
        payload.address = "";
        payload.geoLat = null;
        payload.geoLng = null;
      } else if (nextCoords) {
        payload.address = nextAddress;
        payload.geoLat = nextCoords.lat;
        payload.geoLng = nextCoords.lng;
      } else {
        setError(SAVE_ADDRESS_ERROR_MESSAGE);
        setProfileSaveStatus("error");
        return false;
      }
    } else if (coordsChanged && nextCoords) {
      payload.geoLat = nextCoords.lat;
      payload.geoLng = nextCoords.lng;
    }

    if (Object.keys(payload).length === 0) {
      setProfileSaveStatus("saved");
      return true;
    }

    setProfileSaveStatus("saving");
    try {
      const res = await fetchWithAuth("/api/master/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const errorRes = res.clone();
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | ApiErrorShape | null;
      if (!res.ok || !json || !json.ok) {
        const message = await readErrorMessage(
          errorRes,
          json && !json.ok ? json : null,
          SAVE_ADDRESS_ERROR_MESSAGE
        );
        throw new Error(message);
      }

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
      setProfileSaveStatus("saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : SAVE_ADDRESS_ERROR_MESSAGE);
      setProfileSaveStatus("error");
      return false;
    }
  }, [addressCoords, addressText, avatarUrl, bio, data, displayName, isPublished, tagline]);

  const handleSaveProfile = useCallback(async (): Promise<void> => {
    await saveProfile();
  }, [saveProfile]);

  const handlePublishToggle = useCallback(
    async (nextValue: boolean): Promise<void> => {
      if (isPublishing) return;
      setIsPublishing(true);
      setError(null);
      setProfileSaveStatus("saving");
      try {
        const res = await fetchWithAuth("/api/master/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: nextValue }),
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
            UI_TEXT.master.profile.errors.saveFailed
          );
          throw new Error(message);
        }

        setIsPublished(nextValue);
        setData((prev) =>
          prev
            ? {
                ...prev,
                master: {
                  ...prev.master,
                  isPublished: nextValue,
                },
              }
            : prev
        );
        setProfileSaveStatus("saved");
      } catch (err) {
        setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.saveFailed);
        setProfileSaveStatus("error");
      } finally {
        setIsPublishing(false);
      }
    },
    [isPublishing]
  );

  const updateAutoConfirm = async (nextValue: boolean): Promise<void> => {
    if (!data?.master.isSolo) return;
    const prevValue = autoConfirmBookings;
    setAutoConfirmBookings(nextValue);
    setAutoConfirmSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/providers/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoConfirmBookings: nextValue }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{
            autoConfirmBookings: boolean;
            cancellationDeadlineHours: number | null;
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
      const deadlineValue = json.data.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
    } catch (err) {
      setAutoConfirmBookings(prevValue);
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.updateSettings);
    } finally {
      setAutoConfirmSaving(false);
    }
  };

  const saveCancellationDeadline = async (): Promise<void> => {
    if (!data?.master.isSolo) return;
    setCancellationDeadlineSaving(true);
    setCancellationSaved(false);
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

      const res = await fetchWithAuth("/api/providers/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationDeadlineHours: value }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{
            autoConfirmBookings: boolean;
            cancellationDeadlineHours: number | null;
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
      const deadlineValue = json.data.cancellationDeadlineHours ?? null;
      setCancellationDeadlineHours(deadlineValue);
      setCancellationDeadlineInput(deadlineValue === null ? "" : String(deadlineValue));
      setCancellationSaved(true);
      if (cancellationSavedTimeoutRef.current !== null) {
        window.clearTimeout(cancellationSavedTimeoutRef.current);
      }
      cancellationSavedTimeoutRef.current = window.setTimeout(() => {
        setCancellationSaved(false);
      }, 2500);
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
      setServicesSaveStatus("saving");
      setError(null);
      const payloadItems = snapshot.map((item) => ({
        serviceId: item.serviceId,
        isEnabled: item.isEnabled,
        durationOverrideMin: item.isEnabled ? normalizeDuration(item.effectiveDurationMin) : item.durationOverrideMin,
        priceOverride:
          item.canEditPrice && item.isEnabled ? normalizePrice(item.effectivePrice) : undefined,
        globalCategoryId: item.canEditPrice ? item.globalCategoryId ?? null : undefined,
        description: item.canEditPrice ? item.description ?? null : undefined,
      }));

      try {
        const res = await fetchWithAuth("/api/master/services", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: payloadItems }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ updated: number }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setServicesSaveStatus("saved");
      } catch (err) {
        setServicesSaveStatus("error");
        setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.saveServices);
        throw err;
      } finally {
        servicesSavingRef.current = false;
        if (servicesPendingRef.current) {
          servicesPendingRef.current = false;
          void saveServices();
        }
      }
    }, []);

  const handleSaveServices = useCallback(async (): Promise<void> => {
    const snapshot = Object.values(servicesDraft);
    if (snapshot.length === 0) return;
    try {
      await saveServices(snapshot);
      const synced = snapshot.map((service) => ({ ...service }));
      setData((prev) =>
        prev
          ? {
              ...prev,
              services: synced,
            }
          : prev
      );
    } catch {
      // errors are handled in saveServices
    }
  }, [saveServices, servicesDraft]);

  useEffect(() => {
    if (hasServiceDraftChanges && servicesSaveStatus !== "idle" && servicesSaveStatus !== "saving") {
      setServicesSaveStatus("idle");
    }
  }, [hasServiceDraftChanges, servicesSaveStatus]);

  const handleSuggestDescription = async (serviceId: string): Promise<void> => {
    if (suggestingDescriptionId) return;
    setSuggestingDescriptionId(serviceId);
    try {
      const res = await fetchWithAuth(`/api/master/services/${serviceId}/suggest-description`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ suggestion: string }> | null;
      if (!res.ok || !json || !json.ok) {
        setError(UI_TEXT.master.profile.services.suggestDescriptionFailed);
        return;
      }
      setServicesDraft((current) => ({
        ...current,
        [serviceId]: {
          ...current[serviceId],
          description: json.data.suggestion,
        },
      }));
    } catch {
      setError(UI_TEXT.master.profile.services.suggestDescriptionFailed);
    } finally {
      setSuggestingDescriptionId(null);
    }
  };

  const createSoloService = async (): Promise<void> => {
    if (!data?.master.isSolo) return;
    const nextTitle = newSoloServiceTitle.trim();
    const errors: { title?: string; price?: string; durationMin?: string } = {};
    if (!nextTitle) errors.title = UI_TEXT.master.profile.errors.addServiceTitleRequired;
    if (!Number.isFinite(newSoloServicePrice) || newSoloServicePrice <= 0) {
      errors.price = UI_TEXT.master.profile.errors.addServicePriceRequired;
    }
    if (
      !Number.isFinite(newSoloServiceDuration) ||
      newSoloServiceDuration < MIN_SERVICE_DURATION_MIN ||
      newSoloServiceDuration > MAX_SERVICE_DURATION_MIN
    ) {
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
      const res = await fetchWithAuth("/api/master/services", {
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
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.saveServices);
    } finally {
      setSaving(false);
    }
  };

  const submitCategoryProposal = async (): Promise<void> => {
    const title = proposeCategoryTitle.trim();
    if (!title) return;
    setProposeCategorySaving(true);
    setError(null);
    setProposeCategoryMessage(null);
    try {
      const res = await fetchWithAuth("/api/categories/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title, context: "SERVICE" }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await loadCategoryOptions();
      setProposeCategoryTitle("");
      setProposeCategoryOpen(false);
      setProposeCategoryMessage(UI_TEXT.master.profile.services.proposeCategorySuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : UI_TEXT.master.profile.errors.proposeCategory);
    } finally {
      setProposeCategorySaving(false);
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
      const res = await fetchWithAuth(`/api/media/${avatarAssetId}`, { method: "DELETE" });
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
      const res = await fetchWithAuth("/api/master/portfolio", {
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
      const res = await fetchWithAuth(`/api/master/portfolio/${item.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      const assetId = portfolioAssetIdsByUrl[item.mediaUrl] ?? parseMediaAssetId(item.mediaUrl);
      if (assetId) {
        await fetchWithAuth(`/api/media/${assetId}`, { method: "DELETE" });
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

      const createRes = await fetchWithAuth("/api/master/portfolio", {
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
      const res = await fetchWithAuth(`/api/master/portfolio/${portfolioCategoryTarget.id}/category`, {
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
              ★ {data?.master.ratingAvg.toFixed(1)} • {data?.master.ratingCount}{" "}
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
      const res = await fetchWithAuth(`/api/master/services/${bookingConfigServiceId}/booking-config`, {
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


      {!data.master.isSolo ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-200">
                {UI_TEXT.master.profile.leaveStudio.bannerTitle}
              </p>
              <p className="mt-1 text-xs text-text-sec">
                {UI_TEXT.master.profile.leaveStudio.bannerDescription}
              </p>
            </div>
            <Button
              variant="secondary"
              size="none"
              onClick={openLeaveStudioModal}
              className="rounded-xl border border-amber-500/30 px-4 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
            >
              {UI_TEXT.master.profile.leaveStudio.bannerAction}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-bg-card/70 p-2 lg:flex-col lg:p-3">
          {PROFILE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;

  return (
              <Button
                key={tab.id}
                variant={isActive ? "secondary" : "ghost"}
                size="none"
                onClick={() => setActiveTab(tab.id)}
                className="whitespace-nowrap rounded-xl px-3 py-2 text-sm transition"
              >
                {tab.label}
              </Button>
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
                    <Button
                      variant="secondary"
                      size="none"
                      onClick={() => setPreviewOpen(true)}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-sec transition hover:text-text-main lg:hidden"
                    >
                      {UI_TEXT.master.profile.preview.openAsClient}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative h-24 w-24">
                        <Button
                          variant="wrapper"
                          onClick={openAvatarFileDialog}
                          disabled={saving}
                          className="group relative block h-full w-full overflow-hidden rounded-2xl bg-bg-input text-left transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-70"
                          aria-label={UI_TEXT.master.profile.form.replaceAvatarAria}
                        >
                          {avatarUrl ? (
                            <FocalImage
                              src={avatarUrl}
                              alt={UI_TEXT.media.avatar.alt}
                              focalX={avatarFocalX}
                              focalY={avatarFocalY}
                              className="h-full w-full rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-text-sec">
                              <Camera className="h-4 w-4" />
                              <span className="text-[10px] leading-none">{UI_TEXT.common.noPhoto}</span>
                            </div>
                          )}
                          <div
                            className={`pointer-events-none absolute inset-0 bg-black/35 transition-opacity ${
                              avatarUrl ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
                            }`}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-2 pt-6">
                            <span className="block text-[10px] font-medium leading-none text-white">
                              {avatarUrl ? UI_TEXT.master.profile.form.replaceAvatarAction : UI_TEXT.media.avatar.upload}
                            </span>
                          </div>
                        </Button>
                        {avatarAssetId ? (
                          <Button
                            variant="ghost"
                            size="none"
                            onClick={() => void deleteAvatar()}
                            disabled={saving}
                            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-60"
                            aria-label={UI_TEXT.master.profile.form.removeAvatarAria}
                            title={UI_TEXT.master.profile.form.removeAvatarAction}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.form.nameLabel}
                        <Input
                          className={`${inputBaseClass} ${profileFieldErrors.displayName ? inputErrorClass : ""}`}
                          value={displayName ?? ""}
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
                        {UI_TEXT.master.profile.form.hashtagLabel}
                        <Input
                          className={inputBaseClass}
                          value={tagline ?? ""}
                          onChange={(event) => setTagline(event.target.value)}
                          placeholder={UI_TEXT.master.profile.form.hashtagPlaceholder}
                        />
                        <div className="mt-1 text-xs text-text-sec">{UI_TEXT.master.profile.form.hashtagHint}</div>
                      </label>
                    </div>

                    <div ref={addressSuggestRootRef} className="relative">
                      <label className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.form.addressLabel}
                        <Textarea
                          ref={addressInputRef}
                          className={inputBaseClass}
                          value={addressText ?? ""}
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
                            <Button
                              variant="ghost"
                              size="none"
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
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {addressStatus ? (
                        <div className={`mt-1 text-xs ${addressStatusTone}`}>{addressStatus.text}</div>
                      ) : null}
                    </div>

                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.form.bioLabel}
                      <Textarea
                        className={inputBaseClass}
                        value={bio ?? ""}
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
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {isPublishing ? UI_TEXT.status.saving : UI_TEXT.master.profile.publication.publishAction}
                    </span>
                    <Switch
                      checked={isPublished}
                      disabled={isPublishing}
                      onCheckedChange={(nextValue) => void handlePublishToggle(nextValue)}
                    />
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="primary"
                      size="none"
                      onClick={() => void handleSaveProfile()}
                      disabled={profileSaveStatus === "saving" || isPublishing}
                      className="rounded-xl px-4 py-2 text-sm font-semibold"
                    >
                      {profileSaveStatus === "saving" ? UI_TEXT.status.saving : UI_TEXT.actions.save}
                    </Button>
                  </div>
                </div>
              </div>

              <aside className="sticky top-6 hidden lg:block">
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.master.profile.preview.title}</div>
                {previewPanel}
              </aside>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="space-y-8 p-1">
              <div>
                <h3 className="text-xl font-semibold">{UI_TEXT.settings.title}</h3>
                <p className="mt-1 text-sm text-text-sec">{UI_TEXT.settings.subtitle}</p>
              </div>

              <SettingsSection title={UI_TEXT.settings.sections.publicPage}>
                <PublicUsernameCard endpoint="/api/cabinet/master/public-username" />
              </SettingsSection>

              <SettingsSection title={UI_TEXT.settings.shareProfile.title}>
                <ShareProfileSection endpoint="/api/cabinet/master/public-username" />
              </SettingsSection>

              {data.master.isSolo ? (
                <SettingsSection title={UI_TEXT.settings.sections.bookingRules}>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{UI_TEXT.settings.autoConfirm.title}</p>
                      <p className="mt-0.5 text-xs text-text-sec">{UI_TEXT.settings.autoConfirm.hint}</p>
                    </div>
                    <Switch
                      checked={autoConfirmBookings ?? false}
                      onCheckedChange={(nextValue) => void updateAutoConfirm(nextValue)}
                      disabled={autoConfirmLoading || autoConfirmSaving}
                      className="shrink-0"
                    />
                  </div>
                  <SectionDivider />
                  <div className="p-4">
                    <p className="text-sm font-medium">{UI_TEXT.settings.cancellation.title}</p>
                    <p className="mt-0.5 text-xs text-text-sec">{UI_TEXT.settings.cancellation.hint}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="relative w-32">
                        <Input
                          type="number"
                          min={0}
                          max={168}
                          inputMode="numeric"
                          value={cancellationDeadlineInput}
                          onChange={(event) => setCancellationDeadlineInput(event.target.value)}
                          onBlur={() => void saveCancellationDeadline()}
                          disabled={autoConfirmLoading || cancellationDeadlineSaving}
                          className="h-10 w-full rounded-xl border border-border-subtle bg-bg-input px-3 pr-8 text-sm text-text-main outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="24"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-sec">
                          {UI_TEXT.common.hoursShortLetter}
                        </span>
                      </div>
                      {cancellationSaved ? (
                        <span className="text-xs text-text-sec">{UI_TEXT.common.saved}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-text-sec">
                      {cancellationDeadlineHours === null
                        ? UI_TEXT.common.noLimit
                        : `${cancellationDeadlineHours} ${UI_TEXT.common.hoursShortLetter}`}
                    </p>
                  </div>
                </SettingsSection>
              ) : null}

              <SettingsSection title={UI_TEXT.settings.sections.proFeatures} pro>
                {hasTelegramAccess ? (
                  <TelegramNotificationsSection embedded />
                ) : (
                  <LockedFeatureRow
                    title={UI_TEXT.settings.telegram.title}
                    hint={UI_TEXT.settings.telegram.hint}
                    hasAccess={false}
                    showUpgradeTip={upgradeTipKey === "telegram"}
                    onUpgradeClick={() => handleUpgradeClick("telegram")}
                  >
                    <Button
                      variant="secondary"
                      size="none"
                      className="shrink-0 rounded-xl bg-white/8 px-3 py-1.5 text-xs font-medium text-text-main"
                    >
                      {UI_TEXT.settings.telegram.connect}
                    </Button>
                  </LockedFeatureRow>
                )}
                <SectionDivider />
                {hasVkAccess ? (
                  <VkNotificationsSection embedded />
                ) : (
                  <LockedFeatureRow
                    title={UI_TEXT.settings.notifications.vk.title}
                    hint={UI_TEXT.settings.notifications.vk.enable}
                    hasAccess={false}
                    showUpgradeTip={upgradeTipKey === "vk"}
                    onUpgradeClick={() => handleUpgradeClick("vk")}
                  >
                    <Button
                      variant="secondary"
                      size="none"
                      className="shrink-0 rounded-xl bg-white/8 px-3 py-1.5 text-xs font-medium text-text-main"
                    >
                      {UI_TEXT.settings.notifications.vk.connect}
                    </Button>
                  </LockedFeatureRow>
                )}
                <SectionDivider />
                {hasHotSlotsAccess ? (
                  <HotSlotsSettingsSection services={serviceList} embedded />
                ) : (
                  <LockedFeatureRow
                    title={UI_TEXT.settings.hotSlots.title}
                    hint={UI_TEXT.settings.hotSlots.hint}
                    hasAccess={false}
                    showUpgradeTip={upgradeTipKey === "hotSlots"}
                    onUpgradeClick={() => handleUpgradeClick("hotSlots")}
                  >
                    <Button
                      variant="secondary"
                      size="none"
                      className="shrink-0 rounded-xl bg-white/8 px-3 py-1.5 text-xs font-medium text-text-main"
                    >
                      {UI_TEXT.settings.hotSlots.configure}
                    </Button>
                  </LockedFeatureRow>
                )}
              </SettingsSection>

              <div className="rounded-2xl border border-red-500/20 bg-red-500/4 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-red-300">{UI_TEXT.settings.danger.title}</p>
                    <p className="mt-1 text-xs text-text-sec">{UI_TEXT.settings.danger.hint}</p>
                    {!data?.master.isSolo ? (
                      <Button
                        variant="secondary"
                        size="none"
                        onClick={() => {
                          setLeaveStudioError(null);
                          setLeaveStudioTransferServices(true);
                          setLeaveStudioModalOpen(true);
                        }}
                        className="mt-3 mr-2 rounded-xl border border-amber-500/30 px-4 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10"
                      >
                        {UI_TEXT.master.profile.leaveStudio.leaveAction}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="none"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteActiveCount(null);
                        setDeleteModalOpen(true);
                      }}
                      className="mt-3 rounded-xl border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      {UI_TEXT.settings.danger.cta}
                    </Button>
                  </div>
                </div>
              </div>
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
                <div className="flex items-center gap-3">
                  {servicesSaveStatus === "saved" ? (
                    <div className="text-xs text-emerald-500">{UI_TEXT.common.saved}</div>
                  ) : servicesSaveStatus === "error" ? (
                    <div className="text-xs text-rose-400">{UI_TEXT.master.profile.errors.saveServices}</div>
                  ) : null}
                  <Button
                    variant="primary"
                    size="none"
                    onClick={() => void handleSaveServices()}
                    disabled={servicesSaveStatus === "saving" || !hasServiceDraftChanges}
                    className="rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    {servicesSaveStatus === "saving" ? UI_TEXT.status.saving : UI_TEXT.actions.save}
                  </Button>
                </div>
              </div>

              {pendingServiceCategoryNames.length > 0 ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                  {UI_TEXT.master.profile.services.pendingCategoryNotice(
                    pendingServiceCategoryNames.join("», «")
                  )}
                </div>
              ) : null}

        {showAddServicePanel ? (
          <div className="rounded-2xl bg-bg-card/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">{UI_TEXT.master.profile.services.newServiceTitle}</h4>
              <Button
                variant="ghost"
                size="none"
                onClick={() => setShowAddServicePanel(false)}
                className="text-xs text-text-sec"
              >
                {UI_TEXT.master.profile.services.hide}
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {data.master.isSolo ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.globalCategoryLabel}
                      <Select
                        value={newSoloServiceGlobalCategoryId}
                        onChange={(event) => setNewSoloServiceGlobalCategoryId(event.target.value)}
                        className={selectBaseClass}
                      >
                        <option value="">{UI_TEXT.master.profile.services.selectCategory}</option>
                        {globalCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {formatCategoryOptionLabel(category)}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {!newSoloServiceGlobalCategoryId ? (
                      <div className="text-xs text-text-sec">
                        {UI_TEXT.master.profile.services.selectCategoryHint}
                      </div>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="none"
                      onClick={() => setProposeCategoryOpen(true)}
                      className="text-xs font-medium text-primary underline"
                    >
                      {UI_TEXT.master.profile.services.addOwnCategoryCta}
                    </Button>
                    {proposeCategoryMessage ? (
                      <div className="text-xs text-emerald-500">{proposeCategoryMessage}</div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_140px_150px]">
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.serviceTitleLabel}
                      <Input
                        type="text"
                        value={newSoloServiceTitle}
                        onChange={(event) => {
                          setNewSoloServiceTitle(event.target.value);
                          setNewSoloServiceFieldErrors((current) => ({ ...current, title: undefined }));
                        }}
                        className={`${inputBaseClass} ${newSoloServiceFieldErrors.title ? inputErrorClass : ""}`}
                        placeholder={UI_TEXT.master.profile.services.serviceTitleExample}
                      />
                    </label>
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.master.profile.services.priceLabel}
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          value={newSoloServicePrice === 0 ? "" : String(newSoloServicePrice)}
                          onChange={(event) => {
                            const raw = event.target.value;
                            setNewSoloServicePrice(raw === "" ? 0 : Number(raw) || 0);
                            setNewSoloServiceFieldErrors((current) => ({ ...current, price: undefined }));
                          }}
                          onBlur={() =>
                            setNewSoloServicePrice((value) => (value > 0 ? normalizePrice(value) : value))
                          }
                          className={`${selectBaseClass} ${newSoloServiceFieldErrors.price ? inputErrorClass : ""}`}
                          placeholder="1500"
                        />
                        <span className="text-xs text-text-sec">{UI_TEXT.common.currencyRub}</span>
                      </div>
                    </label>
                    <label className="text-xs text-text-sec">
                      {UI_TEXT.services.fields.duration}
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          type="number"
                          min={MIN_SERVICE_DURATION_MIN}
                          max={MAX_SERVICE_DURATION_MIN}
                          step={SERVICE_DURATION_STEP_MIN}
                          inputMode="numeric"
                          value={newSoloServiceDuration === 0 ? "" : String(newSoloServiceDuration)}
                          placeholder={UI_TEXT.services.fields.durationPlaceholder}
                          onChange={(event) => {
                            const raw = event.target.value;
                            setNewSoloServiceDuration(raw === "" ? 0 : Number(raw));
                            setNewSoloServiceFieldErrors((current) => ({ ...current, durationMin: undefined }));
                          }}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value) || value <= 0) {
                              setNewSoloServiceDuration(MIN_SERVICE_DURATION_MIN);
                              return;
                            }
                            setNewSoloServiceDuration(normalizeDuration(value));
                          }}
                          className={`${selectBaseClass} ${newSoloServiceFieldErrors.durationMin ? inputErrorClass : ""}`}
                        />
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
                  <Button
                    variant="secondary"
                    size="none"
                    onClick={() => void createSoloService()}
                    disabled={saving}
                    className="rounded-xl px-4 py-2 text-sm"
                  >
                    {saving ? UI_TEXT.status.saving : UI_TEXT.master.profile.services.addService}
                  </Button>
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select
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
                  </Select>
                  <Button
                    variant="secondary"
                    size="none"
                    onClick={addStudioService}
                    className="rounded-xl px-4 py-2 text-sm"
                  >
                    {UI_TEXT.actions.add}
                  </Button>
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
                    {service.canEditPrice ? (
                      <div className="mt-2 space-y-1">
                        <Select
                          value={service.globalCategoryId ?? ""}
                          onChange={(event) =>
                            setServicesDraft((current) => ({
                              ...current,
                              [service.serviceId]: {
                                ...current[service.serviceId],
                                globalCategoryId: event.target.value || null,
                                globalCategory:
                                  globalCategories.find((category) => category.id === event.target.value)
                                    ? {
                                        id: event.target.value,
                                        name:
                                          globalCategories.find((category) => category.id === event.target.value)
                                            ?.title ?? "",
                                      }
                                    : null,
                              },
                            }))
                          }
                          className={selectBaseClass}
                        >
                          <option value="">{UI_TEXT.master.profile.services.noCategoryOption}</option>
                          {globalCategories.map((category) => (
                          <option key={`service-category-${service.serviceId}-${category.id}`} value={category.id}>
                              {formatCategoryOptionLabel(category)}
                          </option>
                        ))}
                        </Select>
                        {!service.globalCategoryId ? (
                          <div className="text-xs text-amber-500">
                            {UI_TEXT.master.profile.services.noCategoryHint}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {service.canEditPrice ? (
                      <div className="mt-2 space-y-1">
                        <label className="block text-xs font-medium text-text-sec">
                          {UI_TEXT.master.profile.services.descriptionLabel}
                        </label>
                        <Textarea
                          className={`${selectBaseClass} min-h-[60px] resize-y`}
                          rows={2}
                          maxLength={2000}
                          placeholder={UI_TEXT.master.profile.services.descriptionPlaceholder}
                          value={service.description ?? ""}
                          onChange={(event) =>
                            setServicesDraft((current) => ({
                              ...current,
                              [service.serviceId]: {
                                ...current[service.serviceId],
                                description: event.target.value || null,
                              },
                            }))
                          }
                        />
                        <Button
                          variant="ghost"
                          size="none"
                          disabled={suggestingDescriptionId === service.serviceId}
                          onClick={() => void handleSuggestDescription(service.serviceId)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary/80 disabled:opacity-50"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {suggestingDescriptionId === service.serviceId
                            ? UI_TEXT.master.profile.services.suggestDescriptionLoading
                            : UI_TEXT.master.profile.services.suggestDescription}
                        </Button>
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
                    <Button
                      variant="ghost"
                      size="none"
                      onClick={() => setBookingConfigServiceId(service.serviceId)}
                      className="mt-2 inline-flex text-xs font-medium text-primary underline"
                    >
                      {UI_TEXT.master.profile.bookingConfig.open}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className={`${selectBaseClass} ${
                        serviceFieldErrors[service.serviceId]?.price ? inputErrorClass : ""
                      }`}
                      value={service.effectivePrice === 0 ? "" : String(service.effectivePrice)}
                      disabled={!service.canEditPrice}
                      placeholder="1500"
                      inputMode="numeric"
                      step={100}
                      min={0}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        const raw = rawValue === "" ? 0 : Number(rawValue);
                        setServicesDraft((current) => ({
                          ...current,
                          [service.serviceId]: {
                            ...current[service.serviceId],
                            effectivePrice: Number.isFinite(raw) ? raw : 0,
                            priceOverride: Number.isFinite(raw) && raw > 0 ? raw : null,
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
                    <span className="text-xs text-text-sec">{UI_TEXT.common.currencyRub}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
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
                    </Select>
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

        <Button
          variant="secondary"
          size="none"
          onClick={() => setShowAddServicePanel(true)}
          className="w-full rounded-2xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-3 text-sm text-text-main transition hover:bg-bg-card"
        >
          {UI_TEXT.master.profile.services.addServiceCta}
        </Button>
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
                    <a href="/cabinet/master/billing" className="underline">
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
                  <Button
                    variant="secondary"
                    size="none"
                    onClick={() => setPortfolioMetaOpen(true)}
                    className="mt-3 rounded-lg px-3 py-2 text-sm"
                  >
                    {UI_TEXT.master.profile.portfolio.addDescription}
                  </Button>
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
                        <Button
                          variant="ghost"
                          size="none"
                          onClick={() => openPortfolioCategoryModal(item)}
                          title={UI_TEXT.master.profile.portfolio.notInSearchHint}
                          className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-medium text-white"
                        >
                          {UI_TEXT.master.profile.portfolio.notInSearchBadge}
                        </Button>
                      ) : null}

                      <div className="absolute right-3 top-3 flex gap-2">
                        <label
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm text-white"
                          title={UI_TEXT.master.profile.portfolio.replace}
                        >
                          <Camera className="h-4 w-4" />
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
                        <Button
                          variant="ghost"
                          size="none"
                          onClick={() => void removePortfolio(item)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                          title={UI_TEXT.master.profile.portfolio.remove}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                    <Button
                      variant="secondary"
                      size="none"
                      onClick={addBookingQuestion}
                      disabled={bookingConfigDraft.questions.length >= 5}
                      className="rounded-lg px-3 py-1 text-xs"
                    >
                      {UI_TEXT.master.profile.bookingConfig.addQuestion}
                    </Button>
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
                          <Input
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
                          <Button
                            variant="secondary"
                            size="none"
                            onClick={() => moveBookingQuestion(index, -1)}
                            disabled={index === 0}
                            className="rounded-lg px-2 py-1"
                          >
                            {UI_TEXT.master.profile.bookingConfig.moveUp}
                          </Button>
                          <Button
                            variant="secondary"
                            size="none"
                            onClick={() => moveBookingQuestion(index, 1)}
                            disabled={index === bookingConfigDraft.questions.length - 1}
                            className="rounded-lg px-2 py-1"
                          >
                            {UI_TEXT.master.profile.bookingConfig.moveDown}
                          </Button>
                          <Button
                            variant="danger"
                            size="none"
                            onClick={() => removeBookingQuestion(question.tempId)}
                            className="rounded-lg px-2 py-1"
                          >
                            {UI_TEXT.master.profile.bookingConfig.remove}
                          </Button>
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
              <Button
                variant="secondary"
                size="none"
                onClick={closeBookingConfig}
                className="rounded-xl px-4 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </Button>
              <Button
                variant="primary"
                size="none"
                onClick={() => void saveBookingConfig()}
                disabled={bookingConfigSaving || bookingConfigLoading || !bookingConfigDraft}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
              >
                {bookingConfigSaving ? UI_TEXT.status.saving : UI_TEXT.status.saved}
              </Button>
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

      {proposeCategoryOpen ? (
        <ModalSurface
          open
          onClose={() => {
            if (!proposeCategorySaving) {
              setProposeCategoryOpen(false);
              setProposeCategoryTitle("");
            }
          }}
          title={UI_TEXT.master.profile.services.proposeCategoryTitle}
        >
          <div className="space-y-3">
            <Input
              type="text"
              value={proposeCategoryTitle}
              onChange={(event) => setProposeCategoryTitle(event.target.value)}
              className={inputBaseClass}
              placeholder={UI_TEXT.master.profile.services.proposeCategoryPlaceholder}
              maxLength={60}
            />
            <div className="text-xs text-text-sec">
              {UI_TEXT.master.profile.services.proposeCategoryHint}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="none"
                onClick={() => {
                  setProposeCategoryOpen(false);
                  setProposeCategoryTitle("");
                }}
                disabled={proposeCategorySaving}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </Button>
              <Button
                variant="primary"
                size="none"
                onClick={() => void submitCategoryProposal()}
                disabled={proposeCategorySaving || !proposeCategoryTitle.trim()}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {proposeCategorySaving
                  ? UI_TEXT.status.saving
                  : UI_TEXT.master.profile.services.proposeCategorySubmit}
              </Button>
            </div>
          </div>
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
          title={UI_TEXT.master.profile.portfolioMeta.categoryModalTitle}
        >
          <div className="space-y-3">
            <Select
              value={portfolioCategoryDraft}
              onChange={(event) => setPortfolioCategoryDraft(event.target.value)}
              className={selectBaseClass}
              disabled={portfolioCategorySaving}
            >
              <option value="">{UI_TEXT.master.profile.portfolioMeta.noCategoryOption}</option>
              {globalCategories.map((category) => (
                <option key={`portfolio-category-${category.id}`} value={category.id}>
                  {formatCategoryOptionLabel(category)}
                </option>
              ))}
            </Select>
            <div className="text-xs text-text-sec">
              {UI_TEXT.master.profile.portfolioMeta.categoryHint}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="none"
                onClick={() => {
                  setPortfolioCategoryTarget(null);
                  setPortfolioCategoryDraft("");
                }}
                disabled={portfolioCategorySaving}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </Button>
              <Button
                variant="primary"
                size="none"
                onClick={() => void savePortfolioCategory()}
                disabled={portfolioCategorySaving}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {portfolioCategorySaving ? UI_TEXT.status.saving : UI_TEXT.actions.save}
              </Button>
            </div>
          </div>
        </ModalSurface>
      ) : null}

      {portfolioMetaOpen && pendingPortfolioMeta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-bg-card p-4">
            <h3 className="text-base font-semibold">{UI_TEXT.master.profile.portfolioMeta.photoDescriptionTitle}</h3>
            <div className="mt-3 space-y-2">
              <Input
                className={inputBaseClass}
                value={portfolioCaption}
                onChange={(event) => setPortfolioCaption(event.target.value)}
                placeholder={UI_TEXT.master.profile.portfolioMeta.captionPlaceholder}
              />
              <div className="space-y-1">
                {portfolioCategoryOptions.length === 0 ? (
                  <div className="rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-300">
                    {UI_TEXT.master.profile.portfolioMeta.addCategoryToServicesHint}{" "}
                    <a href="/cabinet/master/profile" className="underline">
                      {UI_TEXT.master.profile.portfolioMeta.goToServices}
                    </a>
                  </div>
                ) : null}
                <Select
                  value={portfolioGlobalCategoryId}
                  onChange={(event) => {
                    setPortfolioGlobalCategoryId(event.target.value);
                    setPortfolioServiceId("");
                  }}
                  className={selectBaseClass}
                  disabled={portfolioCategoryOptions.length === 0}
                >
                  <option value="">{"\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)"}</option>
                  {portfolioCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                {!portfolioGlobalCategoryId ? (
                  <div className="text-xs text-text-sec">
                    {UI_TEXT.master.profile.portfolioMeta.categoryMissingHint}
                  </div>
                ) : null}
              </div>
              {portfolioGlobalCategoryId ? (
                <div className="space-y-1">
                  <Select
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
                  </Select>
                  <div className="text-xs text-text-sec">{UI_TEXT.master.profile.portfolioMeta.serviceHint}</div>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="none"
                onClick={() => {
                  setPortfolioMetaOpen(false);
                  setPortfolioServiceId("");
                  setPortfolioGlobalCategoryId("");
                }}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.close}
              </Button>
              <Button
                variant="primary"
                size="none"
                onClick={() => void commitPendingPortfolio()}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm"
              >
                {UI_TEXT.actions.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ModalSurface
        open={leaveStudioModalOpen}
        onClose={() => {
          if (!leaveStudioLoading) setLeaveStudioModalOpen(false);
        }}
        title={UI_TEXT.master.profile.leaveStudio.modalTitle}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-main">
            {UI_TEXT.master.profile.leaveStudio.modalDescription}
          </p>
          <label className="flex items-start gap-2 text-sm text-text-main">
            <input
              type="checkbox"
              checked={leaveStudioTransferServices}
              onChange={(event) => setLeaveStudioTransferServices(event.target.checked)}
              disabled={leaveStudioLoading}
              className="mt-0.5"
            />
            <span>
              {UI_TEXT.master.profile.leaveStudio.transferServicesLabel}
              <span className="mt-1 block text-xs text-text-sec">
                {UI_TEXT.master.profile.leaveStudio.transferServicesHint}
              </span>
            </span>
          </label>
          {leaveStudioError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {leaveStudioError}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="none"
              onClick={() => setLeaveStudioModalOpen(false)}
              disabled={leaveStudioLoading}
              className="rounded-lg px-3 py-2 text-sm"
            >
              {UI_TEXT.common.cancel}
            </Button>
            <Button
              variant="danger"
              size="none"
              onClick={() => void handleLeaveStudio()}
              disabled={leaveStudioLoading}
              className="rounded-lg px-3 py-2 text-sm"
            >
              {leaveStudioLoading
                ? UI_TEXT.master.profile.leaveStudio.leaving
                : UI_TEXT.master.profile.leaveStudio.leaveAction}
            </Button>
          </div>
        </div>
      </ModalSurface>
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
