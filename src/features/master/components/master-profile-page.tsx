/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ModalSurface } from "@/components/ui/modal-surface";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { ConnectedAccountsSection } from "@/features/master/components/connected-accounts-section";
import { HotSlotsSettingsSection } from "@/features/master/components/hot-slots-settings-section";
import { PublicUsernameCard } from "@/features/cabinet/components/public-username-card";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
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
    address: string;
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
    fieldErrors?: Record<string, string | string[]>;
  };
};

type AddressSuggestResponse = {
  suggestions: string[];
};

type ProfileTab = "main" | "services" | "portfolio" | "settings";

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "main", label: "Основное" },
  { id: "services", label: "Услуги и прайс" },
  { id: "portfolio", label: "Портфолио" },
  { id: "settings", label: "Настройки" },
];

const SERVICE_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function buildDurationOptions(value: number): number[] {
  if (!Number.isFinite(value) || value <= 0) return SERVICE_DURATION_OPTIONS;
  return SERVICE_DURATION_OPTIONS.includes(value) ? SERVICE_DURATION_OPTIONS : [value, ...SERVICE_DURATION_OPTIONS];
}

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
  const [data, setData] = useState<MasterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveInfo, setAutosaveInfo] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<NotificationCenterInviteItem[]>([]);
  const [autoConfirmBookings, setAutoConfirmBookings] = useState<boolean | null>(null);
  const [autoConfirmLoading, setAutoConfirmLoading] = useState(false);
  const [autoConfirmSaving, setAutoConfirmSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("main");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileFieldErrors, setProfileFieldErrors] = useState<{ displayName?: string }>({});

  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
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

  const [dropActive, setDropActive] = useState(false);
  const [brokenPortfolio, setBrokenPortfolio] = useState<Record<string, boolean>>({});

  const [pendingPortfolioMeta, setPendingPortfolioMeta] = useState<PendingPortfolioMeta | null>(null);
  const [portfolioCaption, setPortfolioCaption] = useState("");
  const [portfolioServiceIds, setPortfolioServiceIds] = useState<string[]>([]);
  const [portfolioMetaOpen, setPortfolioMetaOpen] = useState(false);
  const [portfolioAssetIdsByUrl, setPortfolioAssetIdsByUrl] = useState<Record<string, string>>({});
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressSuggestLoading, setAddressSuggestLoading] = useState(false);
  const [addressSuggestFocused, setAddressSuggestFocused] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const newPortfolioInputRef = useRef<HTMLInputElement | null>(null);
  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);
  const addressSuggestAbortRef = useRef<AbortController | null>(null);
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
    address: "",
    bio: "",
    avatarUrl: "",
    isPublished: false,
  });
  const servicesSnapshotRef = useRef<MasterServiceItem[]>([]);
  const dataRef = useRef<MasterProfileData | null>(null);
  const hydratedRef = useRef(false);

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
        profileSnapshotRef.current = {
          displayName: profileData.master.displayName,
          tagline: profileData.master.tagline,
          address: profileData.master.address,
          bio: profileData.master.bio ?? "",
          avatarUrl: profileData.master.avatarUrl ?? "",
          isPublished: profileData.master.isPublished,
        };
        servicesSnapshotRef.current = profileData.services;
        profileSavingRef.current = false;
        profilePendingRef.current = false;
        servicesSavingRef.current = false;
        servicesPendingRef.current = false;
        setData(profileData);
        setDisplayName(profileData.master.displayName);
        setTagline(profileData.master.tagline);
        setAddress(profileData.master.address);
        setBio(profileData.master.bio ?? "");
      setAvatarUrl(profileData.master.avatarUrl ?? "");
      setIsPublished(profileData.master.isPublished);
      setProfileSaveStatus("idle");
      setProfileFieldErrors({});
      setServicesDraft(Object.fromEntries(profileData.services.map((item) => [item.serviceId, item])));

      const categoriesRes = await fetch("/api/catalog/global-categories", { cache: "no-store" });
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
      profileHydratedRef.current = false;
      setAutosaveInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }, []);

    useEffect(() => {
      void load();
    }, [load]);

    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    useEffect(() => {
      profileSnapshotRef.current = {
        displayName,
        tagline,
        address,
        bio,
        avatarUrl,
        isPublished,
      };
    }, [displayName, tagline, address, avatarUrl, bio, isPublished]);

    useEffect(() => {
      servicesSnapshotRef.current = Object.values(servicesDraft);
    }, [servicesDraft]);

  useEffect(() => {
    if (!data?.master.isSolo) {
      setAutoConfirmBookings(null);
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
          | ApiResponse<{ autoConfirmBookings: boolean }>
          | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
        }
        setAutoConfirmBookings(json.data.autoConfirmBookings);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAutoConfirmBookings(null);
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

  const serviceList = useMemo(() => Object.values(servicesDraft), [servicesDraft]);
  const disabledServices = useMemo(
    () => serviceList.filter((service) => !service.isEnabled),
    [serviceList]
  );
  const serviceTitleById = useMemo(
    () => new Map(serviceList.map((service) => [service.serviceId, service.title])),
    [serviceList]
  );

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
        } = {};

        const nextDisplayName = snapshot.displayName.trim();
        if (!nextDisplayName) {
          setProfileFieldErrors({ displayName: "Укажите имя" });
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

        const nextAddress = snapshot.address.trim();
        if (nextAddress !== currentMaster.address.trim()) {
          payload.address = nextAddress;
        }

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
          const json = (await res.json().catch(() => null)) as
            | ApiResponse<{ id: string }>
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
          setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
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
      setProfileFieldErrors({ displayName: "Укажите имя" });
      setProfileSaveStatus("error");
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
  }, [address, avatarUrl, bio, data, displayName, isPublished, saveProfile, tagline]);

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
        | ApiResponse<{ autoConfirmBookings: boolean }>
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить настройки");
    } finally {
      setAutoConfirmSaving(false);
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
    if (!nextTitle) errors.title = "Укажите название";
    if (!Number.isFinite(newSoloServicePrice) || newSoloServicePrice <= 0) errors.price = "Укажите цену";
    if (!Number.isFinite(newSoloServiceDuration) || newSoloServiceDuration <= 0) {
      errors.durationMin = "Выберите длительность";
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
        if (apiError?.fieldErrors) {
          setNewSoloServiceFieldErrors({
            title: firstFieldError(apiError.fieldErrors.title) ?? undefined,
            price: firstFieldError(apiError.fieldErrors.price) ?? undefined,
            durationMin: firstFieldError(
              apiError.fieldErrors.durationMin ?? apiError.fieldErrors.duration
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

  const handlePortfolioDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(true);
  };

  const handlePortfolioDragLeave = () => {
    setDropActive(false);
  };

  const handlePortfolioDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
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

  const profileStatusText =
    profileSaveStatus === "saving"
      ? "Сохраняем..."
      : profileSaveStatus === "saved"
        ? "✓ Изменения сохранены"
        : profileSaveStatus === "error"
          ? "Не удалось сохранить"
          : "";

  const profileStatusTone =
    profileSaveStatus === "saved"
      ? "text-emerald-500"
      : profileSaveStatus === "error"
        ? "text-rose-500"
        : "text-text-sec";

  const previewName = displayName.trim() || "Имя мастера";
  const previewTagline = tagline.trim() || "Добавьте короткий слоган";
  const previewAddress = address.trim() || "Адрес пока не указан";
  const previewBio = bio.trim();
  const inputBaseClass =
    "mt-1 w-full rounded-lg border border-transparent bg-bg-input px-3 py-2 text-sm text-text-main outline-none transition focus:border-border-subtle";
  const inputErrorClass = "border-rose-500 focus:border-rose-500";
  const selectBaseClass =
    "w-full rounded-lg border border-transparent bg-bg-input px-2.5 py-2 text-sm text-text-main outline-none transition focus:border-border-subtle disabled:opacity-60";
  const previewAvatar = avatarUrl ? (
    <img src={avatarUrl} alt="avatar" className="h-full w-full rounded-2xl object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-bg-input text-xs text-text-sec">
      Нет фото
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
              ⭐ {data?.master.ratingAvg.toFixed(1)} · {data?.master.ratingCount} отзывов
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-bg-input/70 p-3 text-xs text-text-sec">
          <div className="text-[11px] font-medium uppercase text-text-sec">Адрес</div>
          <div className="mt-1 text-sm text-text-main">{previewAddress}</div>
        </div>

        <div className="mt-3 text-xs text-text-sec">
          {previewBio || "Добавьте описание, чтобы клиенты лучше узнали о вас."}
        </div>

        <div
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${
            isPublished ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${isPublished ? "bg-emerald-400" : "bg-rose-400"}`} />
          {isPublished ? "Профиль опубликован" : "Не опубликован"}
        </div>
      </div>
    </div>
  );

  if (loading || !data) {
    return <div className="rounded-2xl bg-bg-card/90 p-5 text-sm text-text-sec">Загрузка профиля...</div>;
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {profileStatusText ? <div className={`text-xs ${profileStatusTone}`}>{profileStatusText}</div> : null}
      </header>

      {error ? <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div> : null}

      {pendingInvites.length > 0 ? (
        <div className="rounded-2xl bg-amber-500/10 p-4">
          <h3 className="text-sm font-semibold text-amber-200">Приглашение в студию</h3>
          <p className="mt-1 text-xs text-amber-200/80">
            Примите или отклоните приглашение, чтобы начать работать в студии.
          </p>
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
                      <h3 className="text-sm font-semibold">Профиль и витрина</h3>
                      <p className="mt-1 text-xs text-text-sec">То, что видят клиенты в поиске и на витрине.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(true)}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-text-sec transition hover:text-text-main lg:hidden"
                    >
                      Посмотреть как клиент
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-bg-input">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="avatar" className="h-full w-full rounded-2xl object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-text-sec">
                            Нет фото
                          </div>
                        )}
                        <div className="absolute right-1 top-1 flex gap-1">
                          <button
                            type="button"
                            onClick={openAvatarFileDialog}
                            className="rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
                            aria-label="Заменить аватар"
                          >
                            ✏️
                          </button>
                          {avatarAssetId ? (
                            <button
                              type="button"
                              onClick={() => void deleteAvatar()}
                              className="rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
                              aria-label="Удалить аватар"
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
                          Заменить фото
                        </button>
                        {avatarAssetId ? (
                          <button
                            type="button"
                            onClick={() => void deleteAvatar()}
                            className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-left text-sm text-rose-400 transition hover:bg-bg-card"
                          >
                            Удалить фото
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-text-sec">
                        Имя
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
                              setProfileFieldErrors({ displayName: "Укажите имя" });
                            }
                          }}
                          placeholder="Имя"
                        />
                        {profileFieldErrors.displayName ? (
                          <div className="mt-1 text-xs text-rose-400">{profileFieldErrors.displayName}</div>
                        ) : null}
                      </label>

                      <label className="text-xs text-text-sec">
                        Тэглайн
                        <input
                          className={inputBaseClass}
                          value={tagline}
                          onChange={(event) => setTagline(event.target.value)}
                          placeholder="Например, свадебный макияж"
                        />
                      </label>
                    </div>

                    <div className="relative" ref={addressSuggestRootRef}>
                      <label className="text-xs text-text-sec">
                        Адрес
                        <textarea
                          className={inputBaseClass}
                          value={address}
                          rows={2}
                          onChange={(event) => setAddress(event.target.value)}
                          onFocus={() => setAddressSuggestFocused(true)}
                          placeholder="Адрес приёма"
                        />
                      </label>
                      {addressSuggestFocused ? (
                        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border-subtle bg-bg-card shadow-sm">
                          {addressSuggestLoading ? (
                            <div className="px-3 py-2 text-xs text-text-sec">Ищем адрес...</div>
                          ) : addressSuggestions.length > 0 ? (
                            addressSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                className="block w-full border-b border-border-subtle px-3 py-2 text-left text-sm last:border-b-0 hover:bg-bg-input/80"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setAddress(suggestion);
                                  setAddressSuggestFocused(false);
                                }}
                              >
                                {suggestion}
                              </button>
                            ))
                          ) : address.trim().length >= 3 ? (
                            <div className="px-3 py-2 text-xs text-text-sec">Совпадений не найдено</div>
                          ) : (
                            <div className="px-3 py-2 text-xs text-text-sec">Введите минимум 3 символа</div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <label className="text-xs text-text-sec">
                      Описание
                      <textarea
                        className={inputBaseClass}
                        value={bio}
                        rows={4}
                        onChange={(event) => setBio(event.target.value)}
                        placeholder="О себе"
                      />
                    </label>
                  </div>
                </div>

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

              <aside className="sticky top-6 hidden lg:block">
                <div className="mb-2 text-xs text-text-sec">Предпросмотр витрины</div>
                {previewPanel}
              </aside>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">Настройки</h3>
                <p className="mt-1 text-xs text-text-sec">Автоматизация и внешние каналы уведомлений.</p>
              </div>
              <PublicUsernameCard endpoint="/api/cabinet/master/public-username" />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.master.isSolo ? (
                  <div className="rounded-2xl bg-bg-card/90 p-4">
                    <h4 className="text-sm font-semibold">Автоматизация</h4>
                    <p className="mt-1 text-xs text-text-sec">Настройки подтверждения записей.</p>
                    <div className="mt-3 rounded-xl bg-bg-input/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">Автоподтверждение записи</div>
                          <div className="mt-1 text-xs text-text-sec">
                            Если включено, новые записи будут подтверждаться автоматически.
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={autoConfirmBookings ?? false}
                            disabled={autoConfirmLoading || autoConfirmSaving}
                            onChange={(event) => void updateAutoConfirm(event.target.checked)}
                          />
                          {autoConfirmLoading ? "Загрузка..." : autoConfirmBookings ? "Включено" : "Выключено"}
                        </label>
                      </div>
                    </div>
                  </div>
                  ) : null}

                  <ConnectedAccountsSection />
                  <HotSlotsSettingsSection services={serviceList} />
                </div>
              </div>
            ) : null}

          {activeTab === "services" ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Услуги и прайс</h3>
                  <p className="mt-1 text-xs text-text-sec">
                    Управляйте стоимостью, длительностью и доступностью услуг.
                  </p>
                </div>
                {autosaveInfo ? <div className="text-xs text-text-sec">{autosaveInfo}</div> : null}
              </div>

        {showAddServicePanel ? (
          <div className="rounded-2xl bg-bg-card/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">Новая услуга</h4>
              <button
                type="button"
                onClick={() => setShowAddServicePanel(false)}
                className="text-xs text-text-sec"
              >
                Скрыть
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {data.master.isSolo ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-text-sec">
                      Глобальная категория
                      <select
                        value={newSoloServiceGlobalCategoryId}
                        onChange={(event) => setNewSoloServiceGlobalCategoryId(event.target.value)}
                        className={selectBaseClass}
                      >
                        <option value="">Выберите категорию</option>
                        {globalCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.icon ? `${category.icon} ` : ""}{category.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!newSoloServiceGlobalCategoryId ? (
                      <div className="text-xs text-text-sec">
                        Выберите категорию, чтобы услуга отображалась на сайте.
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_140px_150px]">
                    <label className="text-xs text-text-sec">
                      Название услуги
                      <input
                        type="text"
                        value={newSoloServiceTitle}
                        onChange={(event) => {
                          setNewSoloServiceTitle(event.target.value);
                          setNewSoloServiceFieldErrors((current) => ({ ...current, title: undefined }));
                        }}
                        className={`${inputBaseClass} ${newSoloServiceFieldErrors.title ? inputErrorClass : ""}`}
                        placeholder="Название"
                      />
                    </label>
                    <label className="text-xs text-text-sec">
                      Цена
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
                        <span className="text-xs text-text-sec">₽</span>
                      </div>
                    </label>
                    <label className="text-xs text-text-sec">
                      Длительность
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
                        <span className="text-xs text-text-sec">мин</span>
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
                    {saving ? "Сохраняем..." : "Добавить услугу"}
                  </button>
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    value={selectedStudioServiceId}
                    onChange={(event) => setSelectedStudioServiceId(event.target.value)}
                    className={selectBaseClass}
                  >
                    <option value="">Выберите услугу из каталога студии</option>
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
                    Добавить
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-bg-card/90 p-4">
          <div className="grid grid-cols-[minmax(0,2fr)_150px_150px_90px] items-center gap-3 border-b border-border-subtle pb-2 text-xs text-text-sec">
            <div>Название услуги</div>
            <div>Цена</div>
            <div>Длительность</div>
            <div className="text-center">Вкл.</div>
          </div>
          <div className="divide-y divide-border-subtle">
            {serviceList.map((service) => {
              const durationOptions = buildDurationOptions(service.effectiveDurationMin);
              return (
                <div key={service.serviceId} className="grid grid-cols-[minmax(0,2fr)_150px_150px_90px] items-center gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-main">{service.title}</div>
                    {!service.canEditPrice ? (
                      <div className="mt-1 text-xs text-text-sec">Цена управляется студией, доступен только тайминг.</div>
                    ) : null}
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
                    <span className="text-xs text-text-sec">мин</span>
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
          + Добавить услугу
        </button>
      </div>
          ) : null}

          {activeTab === "portfolio" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">Портфолио</h3>
                <p className="mt-1 text-xs text-text-sec">Добавляйте работы и связывайте их с услугами.</p>
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
                className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center text-sm transition ${
                  dropActive ? "border-primary bg-primary/10" : "border-border-subtle bg-bg-card/80"
                }`}
                onClick={() => newPortfolioInputRef.current?.click()}
                onDragOver={handlePortfolioDragOver}
                onDragLeave={handlePortfolioDragLeave}
                onDrop={handlePortfolioDrop}
              >
                <div className="text-sm font-medium text-text-main">Перетащите фото сюда</div>
                <div className="mt-1 text-xs text-text-sec">
                  или нажмите, чтобы выбрать файл {saving ? "— загружаем..." : ""}
                </div>
              </div>

              {pendingPortfolioMeta ? (
                <div className="rounded-2xl bg-bg-card/90 p-4">
                  <div className="text-xs text-text-sec">Черновик загрузки</div>
                  <img
                    src={pendingPortfolioMeta.mediaUrl}
                    alt="pending"
                    className="mt-3 h-48 w-full rounded-2xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPortfolioMetaOpen(true)}
                    className="mt-3 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-main transition hover:bg-bg-card"
                  >
                    Добавить описание
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
                          Фото недоступно
                        </div>
                      ) : (
                        <img
                          src={item.mediaUrl}
                          alt="portfolio"
                          className="h-40 w-full rounded-xl object-cover"
                          onError={() =>
                            setBrokenPortfolio((current) => ({
                              ...current,
                              [item.id]: true,
                            }))
                          }
                        />
                      )}

                      <div className="absolute right-3 top-3 flex gap-2">
                        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-sm text-white" title="Заменить">
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
                          title="Удалить"
                        >
                          ✖️
                        </button>
                      </div>

                      {item.caption ? <div className="mt-2 text-xs text-text-sec">{item.caption}</div> : null}
                      <div className="mt-2 text-xs text-text-sec">Привязано к услугам</div>
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
                        <div className="mt-1 text-xs text-text-sec">Не указано</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {previewOpen ? (
        <ModalSurface open onClose={() => setPreviewOpen(false)} title="Предпросмотр витрины">
          <div className="flex justify-center">{previewPanel}</div>
        </ModalSurface>
      ) : null}

      {portfolioMetaOpen && pendingPortfolioMeta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-bg-card p-4">
            <h3 className="text-base font-semibold">Описание фото</h3>
            <div className="mt-3 space-y-2">
              <input
                className={inputBaseClass}
                value={portfolioCaption}
                onChange={(event) => setPortfolioCaption(event.target.value)}
                placeholder="Подпись (необязательно)"
              />
              <div className="rounded-lg bg-bg-input/70 p-3">
                <div className="mb-1 text-xs text-text-sec">Какая это услуга? (необязательно)</div>
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
              <button
                type="button"
                onClick={() => setPortfolioMetaOpen(false)}
                className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => void commitPendingPortfolio()}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-3 py-2 text-sm text-[rgb(var(--accent-foreground))] disabled:opacity-60"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
