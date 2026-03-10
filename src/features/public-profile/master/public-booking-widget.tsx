"use client";

import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { ProviderServiceDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { calculateDiscountedPrice, calculateDiscountPercent } from "@/lib/hot-slots/pricing";
import { compareDateKeys, listDateKeysExclusive } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
  type SlotItem as SlotPickerItem,
} from "@/features/booking/components/slot-picker/slot-picker";
import {
  fetchPublicServiceBookingConfig,
  uploadBookingReference,
  type ServiceBookingConfig,
} from "@/features/booking/lib/booking-config";

type SlotItem = SlotPickerItem & {
  startAtUtc: string;
  endAtUtc: string;
  dayKey: string;
  hotSlotId?: string | null;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  discountPercent?: number | null;
};

type Props = {
  providerId: string;
  providerTimezone: string;
  selectedServices: ProviderServiceDto[];
  initialSlotStartAt?: string | null;
  onRemove: (serviceId: string) => void;
};

type MeUser = {
  displayName: string | null;
  phone: string | null;
};

const INITIAL_PAGE_SIZE = 5;
const LOAD_MORE_SIZE = 7;
const SLOT_LOAD_DEBOUNCE_MS = 200;
const PREFETCH_DELAY_MS = 900;
const PROFILER_THRESHOLD_MS = 16;
const SLOT_REMOVED_MESSAGE = UI_TEXT.publicProfile.slots.slotTaken;
const SLOT_NOTICE_TTL_MS = 3000;

function formatDateKeyShort(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}.${month}`;
}
export function PublicBookingWidget({
  providerId,
  providerTimezone,
  selectedServices,
  initialSlotStartAt,
  onRemove,
}: Props) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const providerTimeZone = providerTimezone.trim() ? providerTimezone.trim() : "UTC";
  const isEmpty = selectedServices.length <= 0;
  const totalPrice = selectedServices.reduce((sum, service) => sum + Math.max(0, service.price), 0);
  const totalDuration = selectedServices.reduce((sum, service) => sum + Math.max(0, service.durationMin), 0);
  const isDev = process.env.NODE_ENV !== "production";
  const renderCount = useRef(0);
  useEffect(() => {
    if (!isDev) return;
    renderCount.current += 1;
    console.debug(`[render] PublicBookingWidget #${renderCount.current}`);
  }, [isDev]);

  const [step, setStep] = useState<"summary" | "slots" | "checkout">("summary");
  const [anchorKey, setAnchorKey] = useState<string>(() => toLocalDateKey(new Date(), providerTimeZone));
  const [loadedUntilExclusive, setLoadedUntilExclusive] = useState<string>("");
  const [loadedBatches, setLoadedBatches] = useState<
    Array<{ from: string; toExclusive: string; loadedAt: string }>
  >([]);
  const [hasMore, setHasMore] = useState(true);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlotLabel, setSelectedSlotLabel] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [silentMode, setSilentMode] = useState(false);
  const [guestPhone, setGuestPhone] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [bookingConfig, setBookingConfig] = useState<ServiceBookingConfig | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);
  const [referencePhotoAssetId, setReferencePhotoAssetId] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [bookingAnswers, setBookingAnswers] = useState<Record<string, string>>({});

  const activeRequestIdRef = useRef(0);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const prefetchControllerRef = useRef<AbortController | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const initialSlotPendingRef = useRef<string | null>(null);
  const initialSlotHandledRef = useRef(false);
  const slotServiceId = selectedServices[0]?.id ?? null;
  const dayKeys = useMemo(() => {
    const keys: string[] = [];
    const seen: Record<string, boolean> = {};
    for (const batch of loadedBatches) {
      for (const key of listDateKeysExclusive(batch.from, batch.toExclusive)) {
        if (seen[key]) continue;
        seen[key] = true;
        keys.push(key);
      }
    }
    return keys;
  }, [loadedBatches]);

  const slotsByDay = useMemo(() => {
    const buckets: Record<string, SlotItem[]> = {};
    for (const day of dayKeys) {
      buckets[day] = [];
    }
    for (const slot of slots) {
      const list = buckets[slot.dayKey];
      if (!list) continue;
      list.push(slot);
    }
    return buckets;
  }, [dayKeys, slots]);

  const slotsForSelectedDate = useMemo(
    () => (selectedDate ? slotsByDay[selectedDate] ?? [] : []),
    [selectedDate, slotsByDay]
  );
  const slotGroups = useMemo(() => groupSlotsByTimeOfDay(slotsForSelectedDate), [slotsForSelectedDate]);
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.label === selectedSlotLabel) ?? null,
    [selectedSlotLabel, slots]
  );
  const selectedService = useMemo(
    () => (slotServiceId ? selectedServices.find((service) => service.id === slotServiceId) ?? null : null),
    [selectedServices, slotServiceId]
  );
  const selectedSlotOriginalPrice = useMemo(() => {
    if (!selectedSlot) return null;
    if (typeof selectedSlot.originalPrice === "number") return selectedSlot.originalPrice;
    return selectedService?.price ?? null;
  }, [selectedService?.price, selectedSlot]);
  const selectedSlotDiscountedPrice = useMemo(() => {
    if (!selectedSlot || !selectedSlot.isHot) return null;
    if (typeof selectedSlot.discountedPrice === "number") return selectedSlot.discountedPrice;
    if (
      selectedSlotOriginalPrice === null ||
      selectedSlot.discountType === undefined ||
      typeof selectedSlot.discountValue !== "number"
    ) {
      return null;
    }
    return calculateDiscountedPrice(selectedSlot.discountType, selectedSlot.discountValue, selectedSlotOriginalPrice);
  }, [selectedSlot, selectedSlotOriginalPrice]);
  const selectedSlotDiscountPercent = useMemo(() => {
    if (!selectedSlot || !selectedSlot.isHot) return null;
    if (typeof selectedSlot.discountPercent === "number") return selectedSlot.discountPercent;
    if (
      selectedSlotOriginalPrice === null ||
      selectedSlot.discountType === undefined ||
      typeof selectedSlot.discountValue !== "number"
    ) {
      return null;
    }
    return calculateDiscountPercent(selectedSlot.discountType, selectedSlot.discountValue, selectedSlotOriginalPrice);
  }, [selectedSlot, selectedSlotOriginalPrice]);
  const dayItems = useMemo(
    () =>
      dayKeys.map((dayKey) => ({
        dayKey,
        label: formatDateKeyShort(dayKey),
        count: slotsByDay[dayKey]?.length ?? 0,
      })),
    [dayKeys, slotsByDay]
  );
  const datesWithSlots = useMemo(() => dayItems.filter((item) => item.count > 0), [dayItems]);
  const slotGroupsWithItems = useMemo(
    () => slotGroups.filter((group) => group.items.length > 0),
    [slotGroups]
  );

  const abortActiveRequest = useCallback(() => {
    activeRequestControllerRef.current?.abort();
    activeRequestControllerRef.current = null;
  }, []);

  const abortPrefetchRequest = useCallback(() => {
    prefetchControllerRef.current?.abort();
    prefetchControllerRef.current = null;
  }, []);

  const clearPrefetchTimer = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const handleSelectDate = useCallback((dayKey: string) => {
    setSelectedDate(dayKey);
    setSelectedSlotLabel("");
  }, []);

  const handleSelectSlot = useCallback((label: string) => {
    setSelectedSlotLabel(label);
  }, []);

  const resetSlotsState = useCallback(
    (fromKey: string) => {
      abortActiveRequest();
      abortPrefetchRequest();
      clearPrefetchTimer();
      clearDebounceTimer();
      setSlots([]);
      setSlotsError(null);
      setSlotNotice(null);
      setLoadedBatches([]);
      setLoadedUntilExclusive(fromKey);
      setHasMore(true);
      setSelectedDate("");
      setSelectedSlotLabel("");
    },
    [abortActiveRequest, abortPrefetchRequest, clearDebounceTimer, clearPrefetchTimer]
  );

  const prefetchSlotsPage = useCallback(
    async (fromKey: string, limit: number) => {
      if (!slotServiceId) return;
      abortPrefetchRequest();
      const controller = new AbortController();
      prefetchControllerRef.current = controller;
      try {
        const slotsUrl = new URL(`/api/public/providers/${providerId}/slots`, window.location.origin);
        slotsUrl.searchParams.set("serviceId", slotServiceId);
        slotsUrl.searchParams.set("from", fromKey);
        slotsUrl.searchParams.set("limit", String(limit));
        await fetch(slotsUrl.toString(), { cache: "no-store", signal: controller.signal });
      } catch {
        if (controller.signal.aborted) return;
      }
    },
    [abortPrefetchRequest, providerId, slotServiceId]
  );

  const schedulePrefetch = useCallback(
    (fromKey: string) => {
      if (!slotServiceId) return;
      clearPrefetchTimer();
      prefetchTimerRef.current = window.setTimeout(() => {
        void prefetchSlotsPage(fromKey, LOAD_MORE_SIZE);
      }, PREFETCH_DELAY_MS);
    },
    [clearPrefetchTimer, prefetchSlotsPage, slotServiceId]
  );

  const loadSlotsPage = useCallback(
    async (fromKey: string, limit: number, append: boolean) => {
      if (!slotServiceId) return;
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      abortActiveRequest();
      const controller = new AbortController();
      activeRequestControllerRef.current = controller;
      setSlotsLoading(true);
      setSlotsError(null);
      setSlotNotice(null);
      try {
        const slotsUrl = new URL(`/api/public/providers/${providerId}/slots`, window.location.origin);
        slotsUrl.searchParams.set("serviceId", slotServiceId);
        slotsUrl.searchParams.set("from", fromKey);
        slotsUrl.searchParams.set("limit", String(limit));

        const slotsRes = await fetch(slotsUrl.toString(), { cache: "no-store", signal: controller.signal });
        const slotsJson = (await slotsRes.json().catch(() => null)) as
          | {
              ok: true;
              data: {
                timezone: string;
                slots: Array<{
                  startAtUtc: string;
                  endAtUtc: string;
                  label: string;
                  hotSlotId?: string | null;
                  isHot?: boolean;
                  discountType?: "PERCENT" | "FIXED";
                  discountValue?: number;
                  originalPrice?: number | null;
                  discountedPrice?: number | null;
                  discountPercent?: number | null;
                }>;
                meta: { fromDate: string; toDateExclusive: string; hasMore: boolean };
              };
            }
          | { ok: false; error: { message: string } }
          | null;

        if (!slotsRes.ok || !slotsJson || !slotsJson.ok) {
          throw new Error(UI_TEXT.publicProfile.slots.loadFailed);
        }
        if (controller.signal.aborted || requestId !== activeRequestIdRef.current) return;

        const normalizedSlots: SlotItem[] = (slotsJson.data.slots ?? []).map((slot) => {
          const label = slot.label;
          return {
            id: `${slot.startAtUtc}-${label}`,
            label,
            timeText: UI_FMT.timeShort(slot.startAtUtc, { timeZone: viewerTimeZone }),
            dayKey: toLocalDateKey(slot.startAtUtc, providerTimeZone),
            startAtUtc: slot.startAtUtc,
            endAtUtc: slot.endAtUtc,
            hotSlotId: slot.hotSlotId ?? null,
            isHot: slot.isHot ?? false,
            discountType: slot.discountType,
            discountValue: slot.discountValue,
            originalPrice: slot.originalPrice ?? null,
            discountedPrice: slot.discountedPrice ?? null,
            discountPercent: slot.discountPercent ?? null,
          };
        });
        const meta = slotsJson.data.meta;

        setSlots((prev) => (append ? [...prev, ...normalizedSlots] : normalizedSlots));
        setLoadedUntilExclusive(meta.toDateExclusive);
        setHasMore(meta.hasMore);
        setLoadedBatches((prev) => {
          const batch = {
            from: meta.fromDate,
            toExclusive: meta.toDateExclusive,
            loadedAt: new Date().toISOString(),
          };
          return append ? [...prev, batch] : [batch];
        });
        if (!append) {
          setSelectedDate(meta.fromDate);
          setSelectedSlotLabel("");
          if (meta.hasMore) {
            schedulePrefetch(meta.toDateExclusive);
          }
        } else {
          setSelectedDate((current) => current || meta.fromDate);
        }
      } catch {
        if (controller.signal.aborted || requestId !== activeRequestIdRef.current) return;
        if (!append) {
          setSlots([]);
          setSelectedDate("");
          setSelectedSlotLabel("");
          setLoadedBatches([]);
        }
        setSlotsError(UI_TEXT.publicProfile.slots.loadFailed);
      } finally {
        if (!controller.signal.aborted && requestId === activeRequestIdRef.current) {
          setSlotsLoading(false);
        }
      }
    },
    [abortActiveRequest, providerId, providerTimeZone, schedulePrefetch, slotServiceId, viewerTimeZone]
  );

  useEffect(() => {
    setAnchorKey(toLocalDateKey(new Date(), providerTimeZone));
  }, [providerId, providerTimeZone]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setMeLoading(true);
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { user: MeUser | null } }
          | { ok: false; error: { message: string } }
          | null;

        if (!res.ok || !json || !json.ok) {
          if (!cancelled) setMe(null);
          return;
        }

        if (!cancelled) {
          setMe(json.data.user);
          if (json.data.user?.phone) setGuestPhone(json.data.user.phone);
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slotServiceId) {
      setBookingConfig(null);
      setBookingConfigError(null);
      setBookingAnswers({});
      setReferencePhotoAssetId(null);
      setReferencePreviewUrl(null);
      setReferenceUploadError(null);
      setReferenceUploading(false);
      setBookingConfigLoading(false);
      return;
    }

    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);
    setBookingAnswers({});
    setReferencePhotoAssetId(null);
    setReferencePreviewUrl(null);
    setReferenceUploadError(null);
    setReferenceUploading(false);

    (async () => {
      try {
        const config = await fetchPublicServiceBookingConfig(slotServiceId);
        if (!cancelled) {
          setBookingConfig(config);
        }
      } catch {
        if (!cancelled) {
          setBookingConfig(null);
        setBookingConfigError(UI_TEXT.publicProfile.booking.bookingConfigLoadFailed);
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
  }, [slotServiceId]);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    if (step !== "slots" || !slotServiceId) return;

    resetSlotsState(anchorKey);
    clearDebounceTimer();
    debounceTimerRef.current = window.setTimeout(() => {
      void loadSlotsPage(anchorKey, INITIAL_PAGE_SIZE, false);
    }, SLOT_LOAD_DEBOUNCE_MS);
    return () => {
      clearDebounceTimer();
    };
  }, [anchorKey, clearDebounceTimer, loadSlotsPage, resetSlotsState, slotServiceId, step]);

  useEffect(() => {
    if (!initialSlotStartAt || initialSlotHandledRef.current || !slotServiceId) return;
    const parsed = new Date(initialSlotStartAt);
    if (Number.isNaN(parsed.getTime())) {
      initialSlotHandledRef.current = true;
      return;
    }
    const targetKey = toLocalDateKey(parsed, providerTimeZone);
    initialSlotPendingRef.current = initialSlotStartAt;
    initialSlotHandledRef.current = true;
    setAnchorKey(targetKey);
    setStep("slots");
  }, [initialSlotStartAt, providerTimeZone, slotServiceId]);

  useEffect(() => {
    const pending = initialSlotPendingRef.current;
    if (!pending) return;
    const pendingDate = new Date(pending);
    if (Number.isNaN(pendingDate.getTime())) {
      initialSlotPendingRef.current = null;
      return;
    }
    const pendingKey = toLocalDateKey(pendingDate, providerTimeZone);
    const dayLoaded = loadedBatches.some(
      (batch) =>
        compareDateKeys(pendingKey, batch.from) >= 0 &&
        compareDateKeys(pendingKey, batch.toExclusive) < 0
    );
    if (!dayLoaded) return;

    const match = slots.find((slot) => slot.startAtUtc === pending) ?? null;
    if (match) {
      setSelectedDate(match.dayKey);
      setSelectedSlotLabel(match.label);
    } else {
      setSlotNotice(UI_TEXT.publicProfile.slots.slotTaken);
    }
    initialSlotPendingRef.current = null;
  }, [loadedBatches, providerTimeZone, slots]);

  useEffect(() => {
    if (step === "slots") return;
    abortActiveRequest();
    abortPrefetchRequest();
    clearPrefetchTimer();
    clearDebounceTimer();
  }, [abortActiveRequest, abortPrefetchRequest, clearDebounceTimer, clearPrefetchTimer, step]);

  useEffect(() => {
    if (!selectedSlotLabel) return;
    const stillAvailable = slots.some((slot) => slot.label === selectedSlotLabel);
    if (stillAvailable) return;
    setSelectedSlotLabel("");
    setSlotNotice(SLOT_REMOVED_MESSAGE);
  }, [selectedSlotLabel, slots]);

  useEffect(() => {
    if (datesWithSlots.length === 0) {
      if (selectedDate) {
        setSelectedDate("");
        setSelectedSlotLabel("");
      }
      return;
    }
    if (!selectedDate) {
      setSelectedDate(datesWithSlots[0]?.dayKey ?? "");
      return;
    }
    const selectedDateHasSlots = datesWithSlots.some((item) => item.dayKey === selectedDate);
    if (selectedDateHasSlots) return;
    setSelectedDate(datesWithSlots[0]?.dayKey ?? "");
    setSelectedSlotLabel("");
  }, [datesWithSlots, selectedDate]);

  useEffect(() => {
    if (!slotNotice) return;
    const timer = window.setTimeout(() => {
      setSlotNotice(null);
    }, SLOT_NOTICE_TTL_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [slotNotice]);

  useEffect(() => {
    if (isEmpty && (step === "slots" || step === "checkout")) {
      setStep("summary");
    }
  }, [isEmpty, step]);

  function buildLoginUrl(): string {
    if (typeof window === "undefined") return "/login";
    const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const params = new URLSearchParams({ next: nextPath });
    return `/login?${params.toString()}`;
  }

  async function handleReferenceUpload(file: File) {
    setReferenceUploadError(null);
    setReferenceUploading(true);
    setReferencePhotoAssetId(null);
    setReferencePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });

    const result = await uploadBookingReference(file);
    if (!result.ok) {
      setReferenceUploadError(result.error);
      setReferencePhotoAssetId(null);
    } else {
      setReferencePhotoAssetId(result.assetId);
    }
    setReferenceUploading(false);
  }

  async function onConfirmBooking() {
    if (!selectedSlot || !slotServiceId) return;

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      if (bookingConfig?.requiresReferencePhoto && !referencePhotoAssetId) {
        setSubmitError(UI_TEXT.publicProfile.booking.referencePhotoRequired);
        setSubmitLoading(false);
        return;
      }
      if (bookingConfig?.questions?.length) {
        const missingRequired = bookingConfig.questions.some(
          (question) => question.required && !(bookingAnswers[question.id]?.trim() ?? "")
        );
        if (missingRequired) {
          setSubmitError(UI_TEXT.publicProfile.booking.requiredQuestions);
          setSubmitLoading(false);
          return;
        }
      }

      const clientName = me?.displayName?.trim() || UI_TEXT.publicProfile.booking.clientFallbackName;
      const clientPhone = me?.phone?.trim() || guestPhone.trim();
      if (!clientPhone) {
        setSubmitError(UI_TEXT.publicProfile.booking.authRequiredHint);
        return;
      }

      const answersPayload =
        bookingConfig?.questions
          ?.map((question) => {
            const value = bookingAnswers[question.id]?.trim() ?? "";
            if (!value) return null;
            return {
              questionId: question.id,
              questionText: question.text,
              answer: value,
            };
          })
          .filter((item): item is { questionId: string; questionText: string; answer: string } => item !== null) ??
        null;

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          serviceId: slotServiceId,
          hotSlotId: selectedSlot.hotSlotId ?? null,
          startAtUtc: selectedSlot.startAtUtc,
          endAtUtc: selectedSlot.endAtUtc,
          slotLabel: selectedSlot.label,
          clientName,
          clientPhone,
          comment: comment.trim() ? comment.trim() : null,
          silentMode,
          referencePhotoAssetId,
          bookingAnswers: answersPayload,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { booking: { id: string } } }
        | { ok: false; error: { message: string } }
        | null;

      if (!res.ok || !json || !json.ok) {
        throw new Error(UI_TEXT.publicProfile.booking.submitFailed);
      }

      setSubmitSuccess(UI_TEXT.publicProfile.booking.success);
    } catch {
      setSubmitError(UI_TEXT.publicProfile.booking.submitFailed);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="lux-card rounded-[26px] p-5 text-text-main">
      <div className="text-lg font-semibold">{UI_TEXT.publicProfile.booking.title}</div>

      {step === "summary" && isEmpty ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/70 p-4">
          <div className="text-sm font-medium">{UI_TEXT.publicProfile.booking.emptyTitle}</div>
          <div className="mt-2 text-sm text-text-sec">{UI_TEXT.publicProfile.booking.emptyDesc}</div>
        </div>
      ) : null}

      {step === "summary" && !isEmpty ? (
        <div className="mt-4 space-y-3">
          {selectedServices.map((service) => (
            <div key={service.id} className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{service.name}</div>
                  <div className="mt-1 text-xs text-text-sec">
                    {service.price > 0
                      ? `${new Intl.NumberFormat("ru-RU").format(service.price)} ₽`
                      : UI_TEXT.publicProfile.services.priceOnRequest}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(service.id)}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs transition hover:bg-bg-card"
                >
                  {UI_TEXT.publicProfile.services.remove}
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-sec">{UI_TEXT.publicProfile.booking.total}</span>
              <span>{UI_FMT.totalLabel(totalPrice)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-text-sec">{UI_TEXT.publicProfile.booking.duration}</span>
              <span>{UI_FMT.durationLabel(totalDuration)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {step === "slots" ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                const nextAnchor = toLocalDateKey(new Date(), providerTimeZone);
                setAnchorKey(nextAnchor);
                resetSlotsState(nextAnchor);
                void loadSlotsPage(nextAnchor, INITIAL_PAGE_SIZE, false);
              }}
              disabled={slotsLoading}
              className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs transition hover:bg-bg-card disabled:opacity-60"
            >
              {UI_TEXT.publicProfile.slots.refresh}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!loadedUntilExclusive || !hasMore) return;
                void loadSlotsPage(loadedUntilExclusive, LOAD_MORE_SIZE, true);
              }}
              disabled={!loadedUntilExclusive || !hasMore || slotsLoading}
              className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs transition hover:bg-bg-card disabled:opacity-60"
            >
              {UI_TEXT.publicProfile.slots.showMoreWeek}
            </button>
          </div>

          {slotsLoading ? (
            <div className="text-sm text-text-sec">{UI_TEXT.publicProfile.slots.loadingSlots}</div>
          ) : null}
          {slotsError ? <div className="text-sm text-text-sec">{slotsError}</div> : null}

          {!slotsLoading && !slotsError ? (
            <>
              <div>
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.publicProfile.slots.chooseDay}</div>
                <div className="flex flex-wrap gap-2">
                  {datesWithSlots.map((item) => {
                    const active = selectedDate === item.dayKey;
                    return (
                      <button
                        key={item.dayKey}
                        type="button"
                        onClick={() => handleSelectDate(item.dayKey)}
                        className={`rounded-lg border px-2 py-1 text-xs transition ${
                          active ? "border-primary/60 bg-primary text-[rgb(var(--accent-foreground))]" : "border-border-subtle bg-bg-input hover:bg-bg-card"
                        }`}
                      >
                        {item.label} ({item.count})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs text-text-sec">{UI_TEXT.publicProfile.slots.chooseSlot}</div>
                {slotNotice ? <div className="mb-2 text-xs text-amber-600">{slotNotice}</div> : null}
                {selectedSlot?.isHot ? (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-2 py-1 text-[11px] font-semibold text-orange-400">
                    <span>HOT</span>
                    <span>
                      -{selectedSlotDiscountPercent ?? selectedSlot.discountValue ?? 0}%
                    </span>
                  </div>
                ) : null}
                {slotGroupsWithItems.length > 0 ? (
                  <>
                    {isDev ? (
                      <Profiler
                        id="SlotPickerOptimized"
                        onRender={(_id, _phase, actualDuration) => {
                          if (actualDuration > PROFILER_THRESHOLD_MS) return;
                        }}
                      >
                        <SlotPickerOptimized
                          groups={slotGroupsWithItems}
                          value={selectedSlotLabel}
                          onChange={handleSelectSlot}
                          disabled={slotsLoading}
                        />
                      </Profiler>
                    ) : (
                      <SlotPickerOptimized
                        groups={slotGroupsWithItems}
                        value={selectedSlotLabel}
                        onChange={handleSelectSlot}
                        disabled={slotsLoading}
                      />
                    )}
                  </>
                ) : selectedDate ? (
                  <div className="py-6 text-center text-sm text-text-sec">Нет доступных окон на этот день</div>
                ) : (
                  <div className="text-sm text-text-sec">
                    {selectedDate
                      ? UI_TEXT.publicProfile.slots.allBusy
                      : slots.length > 0
                        ? UI_TEXT.publicProfile.slots.noSlotsForDay
                        : UI_TEXT.publicProfile.slots.noSlots}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {step === "checkout" ? (
        <div className="mt-4 space-y-3">
          {meLoading ? <div className="text-sm text-text-sec">{UI_TEXT.common.loading}</div> : null}
          {!meLoading && me?.phone ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
              {UI_TEXT.publicProfile.booking.bookingOnPhone}: <span className="font-medium">{me.phone}</span>
            </div>
          ) : null}

          {!meLoading && !me ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-main">
              <div className="font-medium">{UI_TEXT.publicProfile.booking.authRequiredTitle}</div>
              <div className="mt-1 text-text-sec">{UI_TEXT.publicProfile.booking.authRequiredHint}</div>
              <label className="mt-3 block text-xs text-text-sec">{UI_TEXT.publicProfile.booking.phoneLabel}</label>
              <input
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                placeholder={UI_TEXT.publicProfile.booking.phonePlaceholder}
                className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-sec"
              />
              <a
                href={buildLoginUrl()}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-3 py-2 text-sm font-semibold text-text-main transition hover:shadow-card"
              >
                {UI_TEXT.publicProfile.booking.loginAndContinue}
              </a>
            </div>
          ) : null}

          {selectedSlot ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
              <div className="text-xs text-text-sec">{UI_TEXT.publicProfile.booking.total}</div>
              {selectedSlot.isHot &&
              selectedSlotOriginalPrice !== null &&
              selectedSlotDiscountedPrice !== null &&
              selectedSlotDiscountedPrice < selectedSlotOriginalPrice ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-text-sec line-through">{UI_FMT.priceLabel(selectedSlotOriginalPrice)}</span>
                  <span className="font-semibold text-text-main">{UI_FMT.priceLabel(selectedSlotDiscountedPrice)}</span>
                  <span className="text-[11px] font-semibold text-orange-400">
                    (-{selectedSlotDiscountPercent ?? 0}%)
                  </span>
                </div>
              ) : (
                <div className="mt-1 font-semibold text-text-main">
                  {UI_FMT.priceLabel(selectedSlotOriginalPrice ?? selectedService?.price ?? 0)}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label
              className="mb-2 block cursor-pointer rounded-xl border border-border-subtle bg-bg-input/70 p-3"
              aria-label={UI_TEXT.publicProfile.booking.silentModeAria}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text-main">
                    {UI_TEXT.publicProfile.booking.silentModeTitle}
                  </div>
                  <div className="mt-1 text-xs text-text-sec">
                    {UI_TEXT.publicProfile.booking.silentModeDesc}
                  </div>
                </div>
                <span
                  className={`relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full border transition ${
                    silentMode ? "border-primary/70 bg-primary/30" : "border-border-subtle bg-bg-card"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={silentMode}
                    onChange={(event) => setSilentMode(event.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                      silentMode ? "left-6" : "left-0.5"
                    }`}
                  />
                </span>
              </div>
            </label>
            <label className="mb-1 block text-xs text-text-sec">{UI_TEXT.publicProfile.booking.comment}</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={UI_TEXT.publicProfile.booking.commentPlaceholder}
              className="lux-input min-h-[84px] w-full rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-sec"
            />
          </div>

          
          {bookingConfigLoading ? (
            <div className="text-xs text-text-sec">{UI_TEXT.publicProfile.booking.bookingConfigLoading}</div>
          ) : null}
          {bookingConfigError ? <div className="text-xs text-rose-400">{bookingConfigError}</div> : null}

          {bookingConfig && (bookingConfig.requiresReferencePhoto || bookingConfig.questions.length > 0) ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm">
              <div className="text-sm font-semibold text-text-main">
                {UI_TEXT.publicProfile.booking.bookingConfigTitle}
              </div>

              {bookingConfig.requiresReferencePhoto ? (
                <div className="mt-3">
                  <label className="block text-xs text-text-sec">
                    {UI_TEXT.publicProfile.booking.referencePhotoLabel}{" "}
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file) void handleReferenceUpload(file);
                    }}
                    disabled={referenceUploading}
                    className="mt-2 block w-full text-xs text-text-sec"
                  />
                  {referenceUploading ? (
                    <div className="mt-2 text-xs text-text-sec">
                      {UI_TEXT.publicProfile.booking.referencePhotoUploading}
                    </div>
                  ) : null}
                  {referenceUploadError ? (
                    <div className="mt-2 text-xs text-rose-400">{referenceUploadError}</div>
                  ) : null}
                  {referencePreviewUrl ? (
                    <div className="relative mt-3 h-48 w-full overflow-hidden rounded-xl">
                      <Image
                        src={referencePreviewUrl}
                        alt={UI_TEXT.publicProfile.booking.referencePhotoAlt}
                        fill
                        sizes="(max-width: 768px) 100vw, 640px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bookingConfig.questions.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {bookingConfig.questions.map((question) => (
                    <label key={question.id} className="block text-xs text-text-sec">
                      <span className="text-sm text-text-main">
                        {question.text}
                        {question.required ? <span className="text-rose-400"> *</span> : null}
                      </span>
                      <input
                        type="text"
                        value={bookingAnswers[question.id] ?? ""}
                        onChange={(event) =>
                          setBookingAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                        }
                        className="lux-input mt-2 w-full rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-sec"
                        placeholder={UI_TEXT.publicProfile.booking.bookingAnswerPlaceholder}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {submitError ? <div className="text-sm text-red-300">{submitError}</div> : null}
          {submitSuccess ? <div className="text-sm text-emerald-300">{submitSuccess}</div> : null}
        </div>
      ) : null}

      {step === "summary" ? (
        <button
          type="button"
          disabled={isEmpty}
          onClick={() => setStep("slots")}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {UI_TEXT.publicProfile.booking.chooseTime}
        </button>
      ) : step === "slots" ? (
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={() => setStep("checkout")}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {UI_TEXT.publicProfile.booking.continueToConfirm}
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={submitLoading || referenceUploading || !selectedSlot || (!me && !guestPhone.trim())}
            onClick={() => void onConfirmBooking()}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-4 py-2 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-card transition hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {UI_TEXT.publicProfile.booking.confirm}
          </button>
          <button
            type="button"
            onClick={() => setStep("slots")}
            className="mt-2 w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-bg-card"
          >
            {UI_TEXT.publicProfile.booking.chooseTime}
          </button>
        </>
      )}
    </div>
  );
}



