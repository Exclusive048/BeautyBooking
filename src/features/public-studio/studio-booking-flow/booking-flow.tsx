"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  createBooking,
  fetchBookingMe,
  fetchMasterAvailability,
  fetchStudioMasters,
  fetchStudioProfile,
  todayKey,
  type BookingUser,
  type SlotItem,
  type StudioMaster,
} from "@/features/booking/lib/studio-booking";
import {
  EMPTY_CONSENT_FLAGS,
  hasRequiredConsents,
  type ConsentFlags,
} from "@/lib/legal/consent-flags";
import {
  fetchPublicServiceBookingConfig,
  uploadBookingReference,
  type ServiceBookingConfig,
} from "@/features/booking/lib/booking-config";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";
import { studioBookingUrl } from "@/lib/public-urls";
import { BookingHero } from "./components/booking-hero";
import { StepsBar, type WizardStep } from "./components/steps-bar";
import { StepTransition } from "./components/step-transition";
import { ServiceStep } from "./components/steps/service-step";
import { MasterStep, ANY_MASTER_ID } from "./components/steps/master-step";
import { WhenStep } from "./components/steps/when-step";
import { YouStep } from "./components/steps/you-step";
import { BookingSummary } from "./components/booking-summary";
import { BookingError } from "./components/booking-error";

type MasterAvailability = {
  serviceAvailable: boolean;
  slots: SlotItem[];
  error?: string;
};

type Props = {
  studioId: string;
  initialMasterId?: string;
  initialMasterKey?: string;
  initialServiceId?: string;
};

function buildLoginUrl(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `/login?${params.toString()}`;
}

function formatDateLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" });
}

export function StudioBookingFlow({ studioId, initialMasterId, initialMasterKey, initialServiceId }: Props) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [studio, setStudio] = useState<ProviderProfileDto | null>(null);
  const [masters, setMasters] = useState<StudioMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // LOGIC-26: при монтировании tz салона ещё не загружена — берём зону
  // зрителя как единственное, что известно, и пересчитываем ниже, как только
  // придёт профиль. К этому моменту выбрать дату пользователь не мог: полоса
  // дней живёт за шагом «когда», а виджет до конца загрузки в состоянии
  // `loading`.
  const [selectedDate, setSelectedDate] = useState(() => todayKey(viewerTimeZone));
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [masterId, setMasterId] = useState(initialMasterId ?? "");
  const [slotLabel, setSlotLabel] = useState("");
  const [availabilityByMaster, setAvailabilityByMaster] = useState<Record<string, MasterAvailability>>({});

  const [me, setMe] = useState<BookingUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [silentMode, setSilentMode] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  // RKN-FIX-02 — guest consent (nothing pre-ticked); signed-in clients never
  // see it and never send it.
  const [consent, setConsent] = useState<ConsentFlags>(EMPTY_CONSENT_FLAGS);
  const [bookingConfig, setBookingConfig] = useState<ServiceBookingConfig | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);
  const [referencePhotoAssetId, setReferencePhotoAssetId] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [bookingAnswers, setBookingAnswers] = useState<Record<string, string>>({});

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState<null | {
    serviceName: string;
    masterName: string;
    dateLabel: string;
    timeLabel: string;
  }>(null);

  // Scenario: B if a master is locked in (initial param or single-master prefill);
  // A otherwise (studio-wide). FOUNDATION already wired ?master= parsing.
  const isScenarioB = Boolean(initialMasterId || initialMasterKey);
  const [step, setStep] = useState<WizardStep>("service");
  const [direction, setDirection] = useState<1 | -1>(1);

  const selectedService = useMemo(
    () => studio?.services.find((service) => service.id === serviceId) ?? null,
    [serviceId, studio?.services],
  );

  // EXP-024: masters who actually perform the selected service (enabled
  // MasterService). Drives both the picker and the availability fetch, so
  // unassigned masters are never listed and never probed for slots (no more
  // 5× 409 SERVICE_INVALID per service pick + no dead-end picker option).
  const assignedMasters = useMemo(() => {
    if (!serviceId) return masters;
    return masters.filter((master) => (master.serviceIds ?? []).includes(serviceId));
  }, [masters, serviceId]);

  const availableMasters = useMemo(() => {
    if (!serviceId) return assignedMasters;
    return assignedMasters.filter((master) => availabilityByMaster[master.id]?.serviceAvailable !== false);
  }, [assignedMasters, availabilityByMaster, serviceId]);

  const resolvedMasterId = useMemo(() => {
    if (masterId && masterId !== ANY_MASTER_ID) return masterId;
    if (masterId === ANY_MASTER_ID) {
      if (!serviceId) return "";
      const withSlots = availableMasters.find((master) => (availabilityByMaster[master.id]?.slots.length ?? 0) > 0);
      return withSlots?.id ?? "";
    }
    return "";
  }, [availabilityByMaster, availableMasters, masterId, serviceId]);

  const slots = useMemo(
    () => (resolvedMasterId ? availabilityByMaster[resolvedMasterId]?.slots ?? [] : []),
    [availabilityByMaster, resolvedMasterId],
  );
  const slotByLabel = useMemo(() => new Map(slots.map((slot) => [slot.label, slot])), [slots]);
  const selectedSlot = slotLabel ? slotByLabel.get(slotLabel) ?? null : null;

  // FIX-BATCH-C Defect 1 (QA-107/FIX-22): slot times are shown in the SALON's
  // timezone (a booking happens at the salon's local clock), never silently
  // converted to the client's browser zone. `salonTz` drives every time display
  // below; the «(город, GMT+N)» label (shown when the viewer's zone differs) is
  // computed with the same shared `zone-label` primitive the bookings list uses.
  const salonTz = studio?.timezone ?? viewerTimeZone;
  const selectedSlotZoneLabel =
    selectedSlot &&
    zonesDifferForViewer({ iso: selectedSlot.startAtUtc, salonTimeZone: salonTz, viewerTimeZone })
      ? formatZoneLabel({ iso: selectedSlot.startAtUtc, timeZone: salonTz })
      : "";

  const prefilledMaster = useMemo(
    () =>
      initialMasterId
        ? masters.find((m) => m.id === initialMasterId) ??
          masters.find((m) => m.publicUsername?.toLowerCase() === initialMasterKey?.toLowerCase()) ??
          null
        : null,
    [initialMasterId, initialMasterKey, masters],
  );

  // Goto helpers
  const goNext = useCallback(
    (from: WizardStep) => {
      setDirection(1);
      if (from === "service") setStep(isScenarioB ? "when" : "master");
      else if (from === "master") setStep("when");
      else if (from === "when") setStep("you");
    },
    [isScenarioB],
  );
  const goBack = useCallback(
    (from: WizardStep) => {
      setDirection(-1);
      if (from === "you") setStep("when");
      else if (from === "when") setStep(isScenarioB ? "service" : "master");
      else if (from === "master") setStep("service");
    },
    [isScenarioB],
  );

  const nextPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : studioBookingUrl(
          { id: studioId, publicUsername: studio?.publicUsername ?? null },
          undefined,
          "studio-booking-flow",
        ) ?? "#";
  const loginHref = buildLoginUrl(nextPath);
  const studioBackHref = studio?.publicUsername ? `/u/${studio.publicUsername}` : `/u/${studioId}`;

  // --- effects (logic preserved from FOUNDATION) -----------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [profileRes, mastersRes] = await Promise.all([fetchStudioProfile(studioId), fetchStudioMasters(studioId)]);
        if (!profileRes.ok) throw new Error(profileRes.error);
        if (profileRes.provider.type !== "STUDIO") throw new Error(UI_TEXT.publicStudio.studioOnlyProfileError);
        if (cancelled) return;
        setStudio(profileRes.provider);
        // LOGIC-26: день по умолчанию — «сегодня» САЛОНА. Клиент из
        // Калининграда (+2), открывающий екатеринбургскую студию (+5) поздно
        // вечером, иначе видел выдачу на вчерашний по меркам салона день.
        setSelectedDate(todayKey(profileRes.provider.timezone));
        setMasters(mastersRes.ok ? mastersRes.masters : []);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : UI_TEXT.publicStudio.bookingError);
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
    setSlotLabel("");
  }, [serviceId]);

  // Fetch availability per master when service or date changes.
  // EXP-024: only assigned masters — no probing (and no 409s) for masters
  // who don't perform the service.
  useEffect(() => {
    if (!serviceId || assignedMasters.length === 0) {
      setAvailabilityByMaster({});
      return;
    }
    let cancelled = false;
    const unavailableCodes = new Set(["SERVICE_INVALID", "SERVICE_DISABLED", "SERVICE_NOT_FOUND"]);
    (async () => {
      setLoadingSlots(true);
      try {
        const results = await Promise.all(
          assignedMasters.map(async (master) => ({
            id: master.id,
            result: await fetchMasterAvailability(master.id, serviceId, selectedDate),
          })),
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
  }, [assignedMasters, selectedDate, serviceId]);

  // If service has a config (questions / reference photo) — load it
  useEffect(() => {
    if (!serviceId) {
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
        const config = await fetchPublicServiceBookingConfig(serviceId);
        if (!cancelled) setBookingConfig(config);
      } catch {
        if (!cancelled) {
          setBookingConfig(null);
          setBookingConfigError(UI_TEXT.publicProfile.booking.bookingConfigLoadFailed);
        }
      } finally {
        if (!cancelled) setBookingConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  // Master prefill via initialMasterKey when masters arrive
  useEffect(() => {
    if (!masters.length) return;
    if (masterId && masterId !== ANY_MASTER_ID) {
      const exists = masters.some((master) => master.id === masterId);
      if (!exists) setMasterId("");
      return;
    }
    if (!masterId && initialMasterKey) {
      const normalized = initialMasterKey.trim().toLowerCase();
      const match = masters.find((master) => master.publicUsername?.toLowerCase() === normalized);
      if (match) setMasterId(match.id);
    }
  }, [initialMasterKey, masterId, masters]);

  // If selected slot disappears, reset
  useEffect(() => {
    if (!slots.length) return;
    if (slotLabel && !slots.some((slot) => slot.label === slotLabel)) {
      setSlotLabel("");
    }
  }, [slots, slotLabel]);

  // --- handlers --------------------------------------------------------------

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

  const isGuest = !meLoading && !me;
  // RKN-FIX-02: for a guest, "contacts ready" now includes the two required
  // consents — the same condition the server enforces, so the CTA never
  // promises a booking the API will refuse.
  const guestValid =
    guestName.trim().length > 0 && guestPhone.trim().length > 0 && hasRequiredConsents(consent);
  const contactsReady = isGuest ? guestValid : !!me;

  const submitDisabled =
    !studio ||
    !selectedService ||
    !resolvedMasterId ||
    !slotLabel ||
    !contactsReady ||
    submitLoading ||
    referenceUploading;

  const done = useMemo<ReadonlySet<WizardStep>>(() => {
    const set = new Set<WizardStep>();
    if (serviceId) set.add("service");
    if (masterId || isScenarioB) set.add("master");
    if (slotLabel) set.add("when");
    if (contactsReady) set.add("you");
    return set;
  }, [serviceId, masterId, slotLabel, contactsReady, isScenarioB]);

  const statusLabel = useMemo(() => {
    if (!serviceId) return UI_TEXT.bookingWidget.summary.badgeService;
    if (!masterId && !isScenarioB) return UI_TEXT.bookingWidget.summary.badgeMaster;
    if (!slotLabel) return UI_TEXT.bookingWidget.summary.badgeWhen;
    if (!contactsReady) return UI_TEXT.bookingWidget.summary.badgeYou;
    return UI_TEXT.bookingWidget.summary.badgeReady;
  }, [serviceId, masterId, slotLabel, contactsReady, isScenarioB]);

  async function onSubmit() {
    if (!studio || !selectedService || !resolvedMasterId || !slotLabel) return;
    const slot = slotByLabel.get(slotLabel) ?? null;
    if (!slot) {
      setSubmitError(UI_TEXT.publicStudio.selectSlotFirst);
      return;
    }

    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitErrorCode(null);

    try {
      if (isGuest) {
        if (!guestName.trim()) {
          setSubmitError(UI_TEXT.publicStudio.guestNameRequired);
          setSubmitLoading(false);
          return;
        }
        if (!guestPhone.trim()) {
          setSubmitError(UI_TEXT.publicStudio.guestPhoneRequired);
          setSubmitLoading(false);
          return;
        }
        // RKN-FIX-02 — mirrors the server check; the CTA is already gated, this
        // is the belt for a stale click.
        if (!hasRequiredConsents(consent)) {
          setSubmitError(UI_TEXT.auth.loginPage.consentRequired);
          setSubmitLoading(false);
          return;
        }
      }

      if (bookingConfig?.requiresReferencePhoto && !referencePhotoAssetId) {
        setSubmitError(UI_TEXT.publicProfile.booking.referencePhotoRequired);
        setSubmitLoading(false);
        return;
      }
      if (bookingConfig?.questions?.length) {
        const missing = bookingConfig.questions.some(
          (q) => q.required && !(bookingAnswers[q.id]?.trim() ?? ""),
        );
        if (missing) {
          setSubmitError(UI_TEXT.publicProfile.booking.requiredQuestions);
          setSubmitLoading(false);
          return;
        }
      }

      const answersPayload =
        bookingConfig?.questions
          ?.map((q) => {
            const value = bookingAnswers[q.id]?.trim() ?? "";
            if (!value) return null;
            return { questionId: q.id, questionText: q.text, answer: value };
          })
          .filter((item): item is { questionId: string; questionText: string; answer: string } => item !== null) ??
        null;

      const result = await createBooking({
        providerId: studio.id,
        serviceId: selectedService.id,
        masterProviderId: resolvedMasterId,
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        slotLabel: slot.label,
        clientName: me?.displayName ?? (guestName.trim() || UI_TEXT.publicProfile.booking.clientFallbackName),
        clientPhone: me?.phone ?? guestPhone.trim(),
        comment: comment.trim() ? comment.trim() : null,
        silentMode,
        referencePhotoAssetId,
        bookingAnswers: answersPayload,
        // Guests only — the server refuses a guest booking without it.
        consent: isGuest ? consent : undefined,
      });

      if (!result.ok) {
        setSubmitError(result.error || UI_TEXT.bookingWidget.errors.generic);
        setSubmitErrorCode(result.code ?? null);
        return;
      }

      const masterName =
        resolvedMasterId === masterId && masterId !== ANY_MASTER_ID
          ? masters.find((m) => m.id === resolvedMasterId)?.name ?? ""
          : masterId === ANY_MASTER_ID
          ? UI_TEXT.bookingWidget.summary.anyMaster
          : masters.find((m) => m.id === resolvedMasterId)?.name ?? "";

      const successZoneLabel = zonesDifferForViewer({
        iso: slot.startAtUtc,
        salonTimeZone: salonTz,
        viewerTimeZone,
      })
        ? formatZoneLabel({ iso: slot.startAtUtc, timeZone: salonTz })
        : "";
      setSuccess({
        serviceName: selectedService.name,
        masterName,
        dateLabel: formatDateLabel(selectedDate),
        timeLabel: `${UI_FMT.timeShort(slot.startAtUtc, { timeZone: salonTz })}${
          successZoneLabel ? ` ${successZoneLabel}` : ""
        }`,
      });
    } finally {
      setSubmitLoading(false);
    }
  }

  // --- rendering -------------------------------------------------------------

  if (loading) {
    return <BookingFlowSkeleton />;
  }
  if (loadError || !studio) {
    return (
      <div className="rounded-2xl border border-red-300/60 bg-red-50/60 p-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        {loadError ?? UI_TEXT.publicStudio.bookingError}
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          ✓
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-text">{UI_TEXT.bookingWidget.success.title}</h2>
        <p className="mt-2 text-sm text-text-muted">
          {UI_TEXT.bookingWidget.success.detailsTemplate
            .replace("{service}", success.serviceName)
            .replace("{master}", success.masterName || UI_TEXT.bookingWidget.summary.anyMaster)
            .replace("{when}", `${success.dateLabel} · ${success.timeLabel}`)}
        </p>
        <p className="mt-2 text-xs text-text-muted">{UI_TEXT.bookingWidget.success.hint}</p>
        <a
          href={studioBackHref}
          className="mt-5 inline-flex rounded-xl bg-bg-muted px-4 py-2 text-sm font-medium text-text hover:bg-bg-muted/70"
        >
          {UI_TEXT.bookingWidget.success.backToStudio}
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* min-w-0: let the wizard column shrink below content width so the
          service-step category filter-chip strip scrolls internally instead
          of forcing page-level horizontal overflow on mobile (WAVE-2-SMALL). */}
      <div className="min-w-0 space-y-4">
        <BookingHero
          studio={studio}
          masters={masters}
          prefilledMaster={prefilledMaster}
          backHref={studioBackHref}
        />

        <StepsBar active={step} done={done} scenarioB={isScenarioB} />

        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 sm:p-6">
          <StepTransition step={step} direction={direction}>
            {step === "service" ? (
              <ServiceStep
                services={studio.services}
                masters={masters}
                selectedServiceId={serviceId}
                prefilledMaster={prefilledMaster}
                onPick={(id) => {
                  setServiceId(id);
                  goNext("service");
                }}
              />
            ) : null}

            {step === "master" ? (
              <MasterStep
                masters={assignedMasters}
                availabilityByMaster={availabilityByMaster}
                selectedMasterId={masterId}
                selectedServiceName={selectedService?.name ?? ""}
                salonTimeZone={salonTz}
                onPick={(id) => {
                  setMasterId(id);
                  goNext("master");
                }}
                onBack={() => goBack("master")}
              />
            ) : null}

            {step === "when" ? (
              <WhenStep
                slots={slots}
                loading={loadingSlots}
                selectedDate={selectedDate}
                onDateChange={(date) => {
                  setSelectedDate(date);
                  setSlotLabel("");
                }}
                selectedSlotLabel={slotLabel}
                onSlotChange={(label) => {
                  setSlotLabel(label);
                  goNext("when");
                }}
                salonTimeZone={salonTz}
                viewerTimeZone={viewerTimeZone}
                selectedMasterName={
                  resolvedMasterId
                    ? masters.find((m) => m.id === resolvedMasterId)?.name ?? ""
                    : ""
                }
                isAnyMaster={masterId === ANY_MASTER_ID}
                visibleSlotDays={30}
                onBack={() => goBack("when")}
              />
            ) : null}

            {step === "you" ? (
              <YouStep
                me={me}
                meLoading={meLoading}
                guestName={guestName}
                guestPhone={guestPhone}
                onGuestNameChange={setGuestName}
                onGuestPhoneChange={setGuestPhone}
                consent={consent}
                onConsentChange={setConsent}
                comment={comment}
                onCommentChange={setComment}
                silentMode={silentMode}
                onSilentChange={setSilentMode}
                loginHref={loginHref}
                onBack={() => goBack("you")}
              />
            ) : null}
          </StepTransition>

          {step === "you" && bookingConfig
            ? renderBookingConfig({
                bookingConfig,
                bookingConfigLoading,
                bookingConfigError,
                referencePreviewUrl,
                referenceUploading,
                referenceUploadError,
                onReferenceUpload: handleReferenceUpload,
                answers: bookingAnswers,
                setAnswers: setBookingAnswers,
              })
            : null}

          {step === "you" ? (
            <div className="mt-4 space-y-3">
              <BookingError
                code={submitErrorCode}
                fallback={submitError ?? undefined}
                minBookingHoursAhead={null}
                maxBookingDaysAhead={null}
              />
            </div>
          ) : null}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <BookingSummary
          serviceName={selectedService?.name ?? null}
          masterName={
            resolvedMasterId ? masters.find((m) => m.id === resolvedMasterId)?.name ?? null : null
          }
          isAnyMaster={masterId === ANY_MASTER_ID}
          dateLabel={selectedDate ? formatDateLabel(selectedDate) : null}
          timeLabel={
            selectedSlot ? UI_FMT.timeShort(selectedSlot.startAtUtc, { timeZone: salonTz }) : null
          }
          zoneLabel={selectedSlotZoneLabel}
          totalKopeks={selectedService?.price ?? null}
          cancellationDeadlineHours={studio.cancellationDeadlineHours ?? null}
          submitDisabled={submitDisabled}
          submitLoading={submitLoading}
          onSubmit={onSubmit}
          statusLabel={statusLabel}
        />
        {step !== "you" ? (
          <div className="mt-3">
            <BookingError
              code={submitErrorCode}
              fallback={submitError ?? undefined}
              minBookingHoursAhead={null}
              maxBookingDaysAhead={null}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function BookingFlowSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="h-44 animate-pulse rounded-2xl bg-bg-muted/40" />
        <div className="h-14 animate-pulse rounded-xl bg-bg-muted/40" />
        <div className="h-72 animate-pulse rounded-2xl bg-bg-muted/40" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-bg-muted/40" />
    </div>
  );
}

function renderBookingConfig(input: {
  bookingConfig: ServiceBookingConfig;
  bookingConfigLoading: boolean;
  bookingConfigError: string | null;
  referencePreviewUrl: string | null;
  referenceUploading: boolean;
  referenceUploadError: string | null;
  onReferenceUpload: (file: File) => void;
  answers: Record<string, string>;
  setAnswers: (updater: (current: Record<string, string>) => Record<string, string>) => void;
}) {
  const {
    bookingConfig,
    bookingConfigLoading,
    bookingConfigError,
    referencePreviewUrl,
    referenceUploading,
    referenceUploadError,
    onReferenceUpload,
    answers,
    setAnswers,
  } = input;

  if (bookingConfigLoading) {
    return <div className="mt-4 text-xs text-text-muted">{UI_TEXT.publicProfile.booking.bookingConfigLoading}</div>;
  }
  if (bookingConfigError) {
    return <div className="mt-4 text-xs text-red-600">{bookingConfigError}</div>;
  }
  if (!bookingConfig.requiresReferencePhoto && bookingConfig.questions.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-bg-muted/30 p-4">
      <div className="text-sm font-semibold text-text">{UI_TEXT.publicProfile.booking.bookingConfigTitle}</div>
      {bookingConfig.requiresReferencePhoto ? (
        <div>
          <label className="block text-xs text-text-muted">
            {UI_TEXT.publicProfile.booking.referencePhotoLabel} <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) onReferenceUpload(file);
            }}
            disabled={referenceUploading}
            className="mt-2 block w-full text-xs text-text-muted"
          />
          {referenceUploading ? (
            <div className="mt-2 text-xs text-text-muted">{UI_TEXT.publicProfile.booking.referencePhotoUploading}</div>
          ) : null}
          {referenceUploadError ? <div className="mt-2 text-xs text-red-600">{referenceUploadError}</div> : null}
          {referencePreviewUrl ? (
            <div className="relative mt-3 h-44 w-full overflow-hidden rounded-xl">
              <Image
                src={referencePreviewUrl}
                alt={UI_TEXT.publicProfile.booking.referencePhotoAlt}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {bookingConfig.questions.length > 0 ? (
        <div className="space-y-3">
          {bookingConfig.questions.map((question) => (
            <label key={question.id} className="block text-xs text-text-muted">
              <span className="text-sm text-text">
                {question.text}
                {question.required ? <span className="text-red-500"> *</span> : null}
              </span>
              <Input
                type="text"
                value={answers[question.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                }
                className="mt-1"
                placeholder={UI_TEXT.publicProfile.booking.bookingAnswerPlaceholder}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
