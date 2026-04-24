"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import { calculateDiscountedPrice } from "@/lib/hot-slots/pricing";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import {
  fetchPublicServiceBookingConfig,
  uploadBookingReference,
  type ServiceBookingConfig,
} from "@/features/booking/lib/booking-config";
import { DateStep } from "@/features/booking/components/booking-flow/steps/date-step";
import { TimeStep } from "@/features/booking/components/booking-flow/steps/time-step";
import { ContactsStep } from "@/features/booking/components/booking-flow/steps/contacts-step";
import { ConfirmStep } from "@/features/booking/components/booking-flow/steps/confirm-step";
import { SuccessStep } from "@/features/booking/components/booking-flow/steps/success-step";
import { BookingSummary } from "@/features/booking/components/booking-flow/booking-summary";
import type {
  BookingFlowSlot,
  BookingFlowState,
  BookingFlowStep,
} from "@/features/booking/components/booking-flow/types";

const t = UI_TEXT.publicProfile.bookingFlow;

const STEP_ORDER: BookingFlowStep[] = ["date", "time", "contacts", "confirm", "success"];

const STEP_LABELS: Record<BookingFlowStep, string> = {
  date: t.stepDate,
  time: t.stepTime,
  contacts: t.stepContacts,
  confirm: t.stepConfirm,
  success: "",
};

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 48 : -48,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.22,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -48 : 48,
    opacity: 0,
    transition: {
      duration: 0.16,
      ease: [0.55, 0, 1, 0.45] as [number, number, number, number],
    },
  }),
};

type MeUser = { displayName: string | null; phone: string | null };

function StepDot({
  index,
  active,
  completed,
  label,
}: {
  index: number;
  active: boolean;
  completed: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-200",
          active
            ? "border-primary bg-gradient-to-br from-primary via-primary-hover to-primary-magenta text-[rgb(var(--accent-foreground))] shadow-sm shadow-primary/30"
            : completed
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border-subtle bg-bg-input text-text-muted"
        )}
      >
        {completed && !active ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          index + 1
        )}
      </div>
      <span
        className={cn(
          "hidden text-[10px] sm:block",
          active ? "font-semibold text-text-main" : "text-text-muted"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ completed }: { completed: boolean }) {
  return (
    <div
      className={cn(
        "mt-3.5 h-px flex-1 transition-colors duration-300",
        completed ? "bg-primary/40" : "bg-border-subtle"
      )}
    />
  );
}

type Props = {
  providerId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  providerTimezone: string;
  initialSlotStartAt?: string | null;
  masterProfileUrl?: string;
};

export function BookingFlowStepper({
  providerId,
  serviceId,
  serviceName,
  servicePrice,
  serviceDurationMin,
  providerTimezone,
  initialSlotStartAt,
  masterProfileUrl,
}: Props) {
  const [state, setState] = useState<BookingFlowState>(() => {
    let initialDateKey: string | null = null;
    let initialStep: BookingFlowStep = "date";
    if (initialSlotStartAt) {
      try {
        initialDateKey = toLocalDateKey(initialSlotStartAt, providerTimezone);
        initialStep = "time";
      } catch {
        // fallback to date step
      }
    }
    return {
      step: initialStep,
      direction: 1,
      serviceId,
      serviceName,
      servicePrice,
      serviceDurationMin,
      selectedDateKey: initialDateKey,
      selectedSlot: null,
      clientName: "",
      clientPhone: "",
      comment: "",
      silentMode: false,
      referencePhotoAssetId: null,
      bookingAnswers: {},
      bookingId: null,
    };
  });

  const [me, setMe] = useState<MeUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [bookingConfig, setBookingConfig] = useState<ServiceBookingConfig | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Stable idempotency key for this booking session
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `bk-${Date.now()}`
  );

  // Fetch current user
  useEffect(() => {
    let cancelled = false;
    setMeLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { user: MeUser | null } }
          | { ok: false }
          | null;
        if (!cancelled) {
          const user = json?.ok ? (json.data.user ?? null) : null;
          setMe(user);
          if (user?.phone) {
            setState((prev) => ({ ...prev, clientPhone: user.phone ?? "" }));
          }
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch booking config for the service
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);
    (async () => {
      try {
        const config = await fetchPublicServiceBookingConfig(serviceId);
        if (!cancelled) setBookingConfig(config);
      } catch {
        if (!cancelled) setBookingConfigError(UI_TEXT.publicProfile.booking.bookingConfigLoadFailed);
      } finally {
        if (!cancelled) setBookingConfigLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceId]);

  // Revoke preview URL on unmount
  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  const currentStepIdx = STEP_ORDER.indexOf(state.step);
  const visibleSteps = STEP_ORDER.filter((s) => s !== "success");
  const isSuccess = state.step === "success";

  const goTo = useCallback((step: BookingFlowStep) => {
    setState((prev) => {
      const prevIdx = STEP_ORDER.indexOf(prev.step);
      const nextIdx = STEP_ORDER.indexOf(step);
      return { ...prev, step, direction: nextIdx >= prevIdx ? 1 : -1 };
    });
  }, []);

  const goNext = useCallback(() => {
    const next = STEP_ORDER[currentStepIdx + 1];
    if (next) goTo(next);
  }, [currentStepIdx, goTo]);

  const goBack = useCallback(() => {
    const prev = STEP_ORDER[currentStepIdx - 1];
    if (prev) goTo(prev);
  }, [currentStepIdx, goTo]);

  const handleSelectDate = useCallback((dateKey: string) => {
    setState((prev) => ({
      ...prev,
      selectedDateKey: dateKey,
      selectedSlot: prev.selectedDateKey !== dateKey ? null : prev.selectedSlot,
    }));
  }, []);

  const handleSelectSlot = useCallback((slot: BookingFlowSlot) => {
    setState((prev) => ({ ...prev, selectedSlot: slot }));
  }, []);

  const handleReferenceUpload = useCallback(async (file: File) => {
    setReferenceUploadError(null);
    setReferenceUploading(true);
    setState((prev) => ({ ...prev, referencePhotoAssetId: null }));
    setReferencePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    const result = await uploadBookingReference(file);
    if (!result.ok) {
      setReferenceUploadError(result.error);
    } else {
      setState((prev) => ({ ...prev, referencePhotoAssetId: result.assetId }));
    }
    setReferenceUploading(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!state.selectedSlot || !serviceId) return;

    setSubmitLoading(true);
    setSubmitError(null);

    try {
      // Validate reference photo
      if (bookingConfig?.requiresReferencePhoto && !state.referencePhotoAssetId) {
        setSubmitError(UI_TEXT.publicProfile.booking.referencePhotoRequired);
        setSubmitLoading(false);
        return;
      }
      // Validate required questions
      if (bookingConfig?.questions?.length) {
        const missing = bookingConfig.questions.some(
          (q) => q.required && !state.bookingAnswers[q.id]?.trim()
        );
        if (missing) {
          setSubmitError(UI_TEXT.publicProfile.booking.requiredQuestions);
          setSubmitLoading(false);
          return;
        }
      }

      const clientPhone = me?.phone?.trim() || state.clientPhone.trim();
      if (!clientPhone) {
        setSubmitError(UI_TEXT.publicProfile.booking.authRequiredHint);
        setSubmitLoading(false);
        return;
      }

      const clientName =
        me?.displayName?.trim() || UI_TEXT.publicProfile.booking.clientFallbackName;

      const answersPayload = bookingConfig?.questions
        ?.map((q) => {
          const val = state.bookingAnswers[q.id]?.trim() ?? "";
          if (!val) return null;
          return { questionId: q.id, questionText: q.text, answer: val };
        })
        .filter((x): x is { questionId: string; questionText: string; answer: string } => x !== null) ?? null;

      // Resolve price: use discounted price for hot slots
      const effectivePrice =
        state.selectedSlot.isHot &&
        typeof state.selectedSlot.discountType !== "undefined" &&
        typeof state.selectedSlot.discountValue === "number" &&
        servicePrice > 0
          ? calculateDiscountedPrice(
              state.selectedSlot.discountType!,
              state.selectedSlot.discountValue,
              state.selectedSlot.originalPrice ?? servicePrice
            )
          : null;
      void effectivePrice; // price determined server-side; included for UX clarity

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          providerId,
          serviceId,
          hotSlotId: state.selectedSlot.hotSlotId ?? null,
          startAtUtc: state.selectedSlot.startAtUtc,
          endAtUtc: state.selectedSlot.endAtUtc,
          slotLabel: state.selectedSlot.label,
          clientName,
          clientPhone,
          comment: state.comment.trim() || null,
          silentMode: state.silentMode,
          referencePhotoAssetId: state.referencePhotoAssetId,
          bookingAnswers: answersPayload,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { booking: { id: string } } }
        | { ok: false; error: { message: string } }
        | null;

      if (!res.ok || !json || !json.ok) {
        throw new Error(
          json?.ok === false ? json.error.message : UI_TEXT.publicProfile.booking.submitFailed
        );
      }

      setState((prev) => ({
        ...prev,
        step: "success",
        direction: 1,
        bookingId: json.data.booking.id,
      }));
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : UI_TEXT.publicProfile.booking.submitFailed
      );
    } finally {
      setSubmitLoading(false);
    }
  }, [
    bookingConfig,
    me,
    providerId,
    serviceId,
    servicePrice,
    state,
  ]);

  // Whether "Next" is enabled for the current step
  const canAdvance =
    state.step === "date"
      ? !!state.selectedDateKey
      : state.step === "time"
        ? !!state.selectedSlot
        : state.step === "contacts"
          ? !!(me?.phone || state.clientPhone.trim())
          : state.step === "confirm"
            ? true
            : false;

  const isFirstStep = currentStepIdx === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Desktop booking summary (above steps) ── */}
      {!isSuccess && (
        <BookingSummary
          step={state.step}
          serviceName={serviceName}
          servicePrice={servicePrice}
          serviceDurationMin={serviceDurationMin}
          selectedDateKey={state.selectedDateKey}
          selectedSlot={state.selectedSlot}
          variant="sidebar"
          className="hidden lg:block"
        />
      )}

      {/* ── Step content ── */}
      <div className="min-w-0 flex-1">
        {/* Step indicator (hidden on success) */}
        {!isSuccess && (
          <div className="mb-5 flex items-center gap-0">
            {visibleSteps.map((step, idx) => (
              <div key={step} className="flex flex-1 items-center">
                <StepDot
                  index={idx}
                  active={state.step === step}
                  completed={currentStepIdx > idx}
                  label={STEP_LABELS[step]}
                />
                {idx < visibleSteps.length - 1 && (
                  <StepConnector completed={currentStepIdx > idx} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step panel */}
        <div className={cn(
          "relative overflow-hidden rounded-[20px] border border-border-subtle bg-bg-card p-4",
          isSuccess && "border-none bg-transparent p-0"
        )}>
          <AnimatePresence initial={false} mode="wait" custom={state.direction}>
            <motion.div
              key={state.step}
              custom={state.direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {state.step === "date" && (
                <DateStep
                  providerId={providerId}
                  selectedDateKey={state.selectedDateKey}
                  onSelectDate={handleSelectDate}
                />
              )}

              {state.step === "time" && state.selectedDateKey && (
                <TimeStep
                  providerId={providerId}
                  serviceId={serviceId}
                  providerTimezone={providerTimezone}
                  selectedDateKey={state.selectedDateKey}
                  selectedSlot={state.selectedSlot}
                  onSelectSlot={handleSelectSlot}
                />
              )}

              {state.step === "contacts" && (
                <ContactsStep
                  me={me}
                  meLoading={meLoading}
                  clientPhone={state.clientPhone}
                  comment={state.comment}
                  silentMode={state.silentMode}
                  bookingAnswers={state.bookingAnswers}
                  referencePreviewUrl={referencePreviewUrl}
                  referenceUploading={referenceUploading}
                  referenceUploadError={referenceUploadError}
                  bookingConfig={bookingConfig}
                  bookingConfigLoading={bookingConfigLoading}
                  bookingConfigError={bookingConfigError}
                  onChangePhone={(v) => setState((prev) => ({ ...prev, clientPhone: v }))}
                  onChangeComment={(v) => setState((prev) => ({ ...prev, comment: v }))}
                  onChangeSilentMode={(v) => setState((prev) => ({ ...prev, silentMode: v }))}
                  onChangeAnswer={(qId, v) =>
                    setState((prev) => ({
                      ...prev,
                      bookingAnswers: { ...prev.bookingAnswers, [qId]: v },
                    }))
                  }
                  onReferenceUpload={handleReferenceUpload}
                />
              )}

              {state.step === "confirm" && state.selectedSlot && (
                <ConfirmStep
                  serviceName={serviceName}
                  servicePrice={servicePrice}
                  selectedSlot={state.selectedSlot}
                  clientPhone={me?.phone ?? state.clientPhone}
                  comment={state.comment}
                  silentMode={state.silentMode}
                  submitError={submitError}
                />
              )}

              {state.step === "success" && state.selectedSlot && (
                <SuccessStep
                  serviceName={serviceName}
                  servicePrice={servicePrice}
                  selectedSlot={state.selectedSlot}
                  masterProfileUrl={masterProfileUrl}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {!isSuccess && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={goBack}
              disabled={isFirstStep || submitLoading}
              className={cn(
                "rounded-xl gap-1",
                isFirstStep && "invisible pointer-events-none"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              {t.back}
            </Button>

            {state.step !== "confirm" ? (
              <Button
                variant="primary"
                size="sm"
                onClick={goNext}
                disabled={!canAdvance}
                className="min-w-[90px] rounded-xl"
              >
                {t.next}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!canAdvance || submitLoading || referenceUploading}
                onClick={() => void handleSubmit()}
                className="min-w-[130px] rounded-xl gap-2"
              >
                {submitLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t.bookCta}
              </Button>
            )}
          </div>
        )}

        {/* Mobile summary strip */}
        {!isSuccess && (
          <BookingSummary
            step={state.step}
            serviceName={serviceName}
            servicePrice={servicePrice}
            serviceDurationMin={serviceDurationMin}
            selectedDateKey={state.selectedDateKey}
            selectedSlot={state.selectedSlot}
            variant="sticky"
            className="mt-4 lg:hidden"
          />
        )}
      </div>

    </div>
  );
}
