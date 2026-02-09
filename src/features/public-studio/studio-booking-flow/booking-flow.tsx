"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
  type SlotItem as SlotPickerItem,
} from "@/features/booking/components/slot-picker/slot-picker";
import {
  buildDateBounds,
  createBooking,
  fetchBookingMe,
  fetchMasterAvailability,
  fetchStudioMasters,
  fetchStudioProfile,
  STUDIO_BOOKING_DAYS_AHEAD,
  todayKey,
  type BookingUser,
  type SlotItem,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type MasterAvailability = {
  serviceAvailable: boolean;
  slots: SlotItem[];
  error?: string;
};

type Props = {
  studioId: string;
  initialMasterId?: string;
  initialServiceId?: string;
};

const ANY_MASTER_ID = "__any__";

function buildLoginUrl(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `/login?${params.toString()}`;
}

export function StudioBookingFlow({ studioId, initialMasterId, initialServiceId }: Props) {
  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [masterId, setMasterId] = useState(initialMasterId ?? "");
  const [slotLabel, setSlotLabel] = useState("");
  const [availabilityByMaster, setAvailabilityByMaster] = useState<Record<string, MasterAvailability>>({});

  const [me, setMe] = useState<BookingUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [silentMode, setSilentMode] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const dateBounds = useMemo(() => buildDateBounds(new Date(), STUDIO_BOOKING_DAYS_AHEAD), []);
  const selectedService = useMemo(
    () => studio?.services.find((service) => service.id === serviceId) ?? null,
    [serviceId, studio?.services]
  );

  const availableMasters = useMemo(() => {
    if (!serviceId) return masters;
    return masters.filter((master) => availabilityByMaster[master.id]?.serviceAvailable !== false);
  }, [availabilityByMaster, masters, serviceId]);

  const resolvedMasterId = useMemo(() => {
    if (!serviceId) return "";
    if (masterId && masterId !== ANY_MASTER_ID) return masterId;
    if (masterId === ANY_MASTER_ID) {
      const withSlots = availableMasters.find((master) => (availabilityByMaster[master.id]?.slots.length ?? 0) > 0);
      return withSlots?.id ?? "";
    }
    return "";
  }, [availabilityByMaster, availableMasters, masterId, serviceId]);

  const slots = useMemo(
    () => (resolvedMasterId ? availabilityByMaster[resolvedMasterId]?.slots ?? [] : []),
    [availabilityByMaster, resolvedMasterId]
  );
  const slotItems = useMemo<SlotPickerItem[]>(
    () =>
      slots.map((slot) => {
        const [, timeText] = slot.label.split(" ");
        return {
          id: slot.label,
          label: slot.label,
          timeText: timeText ?? slot.label,
        };
      }),
    [slots]
  );
  const slotGroups = useMemo(() => groupSlotsByTimeOfDay(slotItems), [slotItems]);
  const slotByLabel = useMemo(() => new Map(slots.map((slot) => [slot.label, slot])), [slots]);

  const nextPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : `/studios/${studioId}/booking`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [profileRes, mastersRes] = await Promise.all([fetchStudioProfile(studioId), fetchStudioMasters(studioId)]);
        if (!profileRes.ok) throw new Error(profileRes.error);
        if (profileRes.provider.type !== "STUDIO") throw new Error(UI_TEXT.publicStudio.studioOnlyProfileError);

        if (cancelled) return;
        setStudio(profileRes.provider);
        setMasters(mastersRes.ok ? mastersRes.masters : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : UI_TEXT.publicStudio.bookingError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studioId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMeLoading(true);
      try {
        const currentUser = await fetchBookingMe();
        if (!cancelled) setMe(currentUser);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMasterId((prev) => (prev === ANY_MASTER_ID ? prev : ""));
    setSlotLabel("");
  }, [serviceId]);

  useEffect(() => {
    if (!serviceId || masters.length === 0) {
      setAvailabilityByMaster({});
      return;
    }

    let cancelled = false;
    const unavailableCodes = new Set(["SERVICE_INVALID", "SERVICE_DISABLED", "SERVICE_NOT_FOUND"]);

    (async () => {
      setLoadingSlots(true);
      try {
        const results = await Promise.all(
          masters.map(async (master) => ({
            id: master.id,
            result: await fetchMasterAvailability(master.id, serviceId, selectedDate),
          }))
        );

        if (cancelled) return;

        const next: Record<string, MasterAvailability> = {};
        for (const entry of results) {
          if (entry.result.ok) {
            next[entry.id] = { serviceAvailable: true, slots: entry.result.slots };
            continue;
          }
          if (unavailableCodes.has(entry.result.code ?? "")) {
            next[entry.id] = { serviceAvailable: false, slots: [] };
            continue;
          }
          next[entry.id] = { serviceAvailable: true, slots: [], error: entry.result.error };
        }
        setAvailabilityByMaster(next);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [masters, selectedDate, serviceId]);

  useEffect(() => {
    if (!slots.length) {
      setSlotLabel("");
      return;
    }
    if (slotLabel && slots.some((slot) => slot.label === slotLabel)) return;
    setSlotLabel(slots[0]?.label ?? "");
  }, [slotLabel, slots]);

  async function onSubmit() {
    if (!studio || !selectedService || !resolvedMasterId || !slotLabel) return;

    const slot = slotByLabel.get(slotLabel) ?? null;
    if (!slot) {
      setSubmitError(UI_TEXT.publicStudio.selectSlotFirst);
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const result = await createBooking({
        providerId: studio.id,
        serviceId: selectedService.id,
        masterProviderId: resolvedMasterId,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        slotLabel: slot.label,
        clientName: me?.displayName ?? UI_TEXT.publicProfile.booking.clientFallbackName,
        clientPhone: me?.phone ?? "",
        comment: comment.trim() ? comment.trim() : null,
        silentMode,
      });

      if (!result.ok && result.error === "AUTH_REQUIRED") {
        setShowAuthModal(true);
        return;
      }
      if (!result.ok) {
        setSubmitError(result.error || UI_TEXT.publicStudio.bookingError);
        return;
      }
      setSubmitSuccess(UI_TEXT.publicStudio.bookingSuccess);
    } finally {
      setSubmitLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`service-skeleton-${index}`} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-4 w-36 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={`slot-skeleton-${index}`} className="h-8 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }
  if (error || !studio) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error ?? UI_TEXT.publicStudio.bookingError}</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6 rounded-2xl border border-border bg-surface p-5 md:p-6">
        <section>
          <h3 className="text-sm font-semibold text-text">{UI_TEXT.publicStudio.chooseService}</h3>
          <div className="mt-3 space-y-2">
            {studio.services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setServiceId(service.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  serviceId === service.id
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-border bg-muted/20 hover:border-neutral-400"
                }`}
              >
                <div className="text-sm font-semibold">{service.name}</div>
                <div className="mt-1 text-xs opacity-80">
                  {service.price > 0
                    ? UI_FMT.priceDurationLabel(service.price, service.durationMin)
                    : UI_TEXT.publicStudio.servicePriceOnRequest}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={serviceId ? "" : "opacity-50"}>
          <h3 className="text-sm font-semibold text-text">{UI_TEXT.publicStudio.chooseMaster}</h3>
          {!serviceId ? <div className="mt-2 text-xs text-text-muted">{UI_TEXT.publicStudio.selectServiceFirst}</div> : null}
          {serviceId && loadingSlots ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`master-skeleton-${index}`} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : null}
          {serviceId && !loadingSlots ? (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => setMasterId(ANY_MASTER_ID)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  masterId === ANY_MASTER_ID
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-border bg-muted/20 hover:border-neutral-400"
                }`}
              >
                {UI_TEXT.publicStudio.anyMaster}
              </button>
              {availableMasters.map((master) => (
                <button
                  key={master.id}
                  type="button"
                  onClick={() => setMasterId(master.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    masterId === master.id
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-border bg-muted/20 hover:border-neutral-400"
                  }`}
                >
                  {master.name}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-surface p-5 md:p-6">
        <section className={serviceId ? "" : "opacity-50"}>
          <h3 className="text-sm font-semibold text-text">{UI_TEXT.publicStudio.chooseDate}</h3>
          <div className="mt-3">
            <DatePicker value={selectedDate} min={dateBounds.min} max={dateBounds.max} onChange={setSelectedDate} />
          </div>
        </section>

        <section className={serviceId && masterId ? "" : "opacity-50"}>
          {loadingSlots ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="h-8 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : !serviceId ? (
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.selectServiceFirst}</div>
          ) : !masterId ? (
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.selectMasterFirst}</div>
          ) : slots.length === 0 ? (
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.noSlots}</div>
          ) : (
            <SlotPickerOptimized groups={slotGroups} value={slotLabel} onChange={setSlotLabel} />
          )}
        </section>

        <section className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{UI_TEXT.publicStudio.chooseService}</span>
              <span className="font-medium text-text">{selectedService?.name ?? UI_TEXT.publicStudio.fallbackValue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{UI_TEXT.publicStudio.chooseMaster}</span>
              <span className="font-medium text-text">
                {masterId === ANY_MASTER_ID
                  ? UI_TEXT.publicStudio.anyMaster
                  : masters.find((master) => master.id === resolvedMasterId)?.name ?? UI_TEXT.publicStudio.fallbackValue}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{UI_TEXT.publicStudio.selectedDate}</span>
              <span className="font-medium text-text">{selectedDate || UI_TEXT.publicStudio.fallbackValue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{UI_TEXT.publicStudio.selectedTime}</span>
              <span className="font-medium text-text">{slotLabel.split(" ")[1] ?? UI_TEXT.publicStudio.fallbackValue}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-text-muted">{UI_TEXT.publicStudio.total}</span>
              <span className="font-semibold text-text">
                {selectedService?.price ? UI_FMT.priceLabel(selectedService.price) : UI_TEXT.publicStudio.servicePriceOnRequest}
              </span>
            </div>
          </div>

          <label
            className="mt-3 block cursor-pointer rounded-xl border border-border bg-surface p-3"
            aria-label="Хочу помолчать"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text">Хочу помолчать 🤫</div>
                <div className="mt-1 text-xs text-text-muted">
                  Мастер поздоровается, уточнит детали и дальше будет работать без разговоров.
                </div>
              </div>
              <span
                className={`relative mt-1 inline-flex h-6 w-11 shrink-0 rounded-full border transition ${
                  silentMode ? "border-primary/70 bg-primary/25" : "border-border-subtle bg-muted/20"
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
          <label className="mt-3 block text-xs text-text-muted">{UI_TEXT.publicProfile.booking.comment}</label>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={UI_TEXT.publicProfile.booking.commentPlaceholder}
            className="mt-1 min-h-[84px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none"
          />

          {submitError ? <div className="mt-2 text-sm text-red-600">{submitError}</div> : null}
          {submitSuccess ? <div className="mt-2 text-sm text-emerald-600">{submitSuccess}</div> : null}
          {!meLoading && !me ? <div className="mt-2 text-xs text-text-muted">{UI_TEXT.publicStudio.authRequiredText}</div> : null}

          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitLoading || !selectedService || !resolvedMasterId || !slotLabel}
            className="mt-4 w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {UI_TEXT.publicStudio.book}
          </button>
        </section>
      </div>

      {showAuthModal ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/45" onClick={() => setShowAuthModal(false)} aria-label={UI_TEXT.common.cancel} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl">
              <div className="text-lg font-semibold text-text">{UI_TEXT.publicStudio.authRequiredTitle}</div>
              <div className="mt-2 text-sm text-text-muted">{UI_TEXT.publicStudio.authRequiredText}</div>
              <div className="mt-4 flex gap-2">
                <Link href={buildLoginUrl(nextPath)} className="flex-1 rounded-xl bg-neutral-900 py-2 text-center text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                  {UI_TEXT.publicStudio.login}
                </Link>
                <button type="button" onClick={() => setShowAuthModal(false)} className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold text-text">
                  {UI_TEXT.common.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
