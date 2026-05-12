"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import {
  fetchPublicServiceBookingConfig,
  uploadBookingReference,
  type ServiceBookingConfig,
} from "@/features/booking/lib/booking-config";
import { UI_TEXT } from "@/lib/ui/text";
import { SelectionPhase } from "@/features/booking/components/booking-flow/phases/selection-phase";
import { FormPhase } from "@/features/booking/components/booking-flow/phases/form-phase";
import { SuccessPhase } from "@/features/booking/components/booking-flow/phases/success-phase";
import { ConflictPhase } from "@/features/booking/components/booking-flow/phases/conflict-phase";
import {
  bookingFlowReducer,
  createInitialState,
} from "@/features/booking/components/booking-flow/lib/flow-reducer";
import {
  clearBookingIdFromUrl,
  readBookingIdFromUrl,
  writeBookingIdToUrl,
} from "@/features/booking/components/booking-flow/lib/url-state";
import { toCanonicalPhone, maskRussianPhone } from "@/features/booking/components/booking-flow/lib/format-phone";
import type {
  ConfirmedBooking,
} from "@/features/booking/components/booking-flow/types";

const T = UI_TEXT.publicProfile.bookingWidget;

type Props = {
  providerId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  providerTimezone: string;
  initialSlotStartAt?: string | null;
  /** Optional: hint for the master-profile-back link in legacy callers (currently unused). */
  masterProfileUrl?: string;
};

type SessionUser = { displayName: string | null; phone: string | null };

type RemoteBookingResponse = {
  id: string;
  status: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  clientName: string | null;
  clientPhoneMasked: string | null;
  service: { id: string; name: string; price: number } | null;
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    address: string | null;
    timezone: string;
  };
};

function asConfirmedBooking(
  remote: RemoteBookingResponse,
  isAuthenticatedUser: boolean,
  fallback?: { serviceName: string; servicePrice: number; providerTimezone: string },
): ConfirmedBooking | null {
  if (!remote.startAtUtc) return null;
  return {
    id: remote.id,
    status: remote.status,
    startAtUtc: remote.startAtUtc,
    endAtUtc: remote.endAtUtc,
    serviceName: remote.service?.name ?? fallback?.serviceName ?? "",
    servicePrice: remote.service?.price ?? fallback?.servicePrice ?? 0,
    providerName: remote.provider.name,
    providerAddress: remote.provider.address ?? null,
    timezone: remote.provider.timezone ?? fallback?.providerTimezone ?? "UTC",
    clientPhoneMasked: remote.clientPhoneMasked ?? null,
    isAuthenticatedUser,
  };
}

/**
 * Booking widget — 4-phase flow (32b):
 *   selection → form → success
 *           └→ conflict ─→ selection
 *
 * Renames itself "BookingFlowStepper" only for import-stability with
 * the existing 32a public profile (booking-section-client imports
 * this symbol). Internally there's no stepper anymore — phases are a
 * pure state machine with framer-motion crossfade between them.
 */
export function BookingFlowStepper({
  providerId,
  serviceId,
  serviceName,
  servicePrice,
  serviceDurationMin,
  providerTimezone,
  initialSlotStartAt,
}: Props) {
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : `bk-${Date.now()}`,
  );

  const [state, dispatch] = useReducer(
    bookingFlowReducer,
    {
      serviceId,
      serviceName,
      servicePrice,
      serviceDurationMin,
      initialDateKey: initialSlotStartAt
        ? (() => {
            try {
              return toLocalDateKey(initialSlotStartAt, providerTimezone);
            } catch {
              return null;
            }
          })()
        : null,
      prefillPhone: "",
      prefillName: "",
    },
    createInitialState,
  );

  const [me, setMe] = useState<SessionUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [bookingConfig, setBookingConfig] = useState<ServiceBookingConfig | null>(null);
  const [bookingConfigLoading, setBookingConfigLoading] = useState(false);
  const [bookingConfigError, setBookingConfigError] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceUploadError, setReferenceUploadError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Service change in the parent — reset selection
  const lastServiceIdRef = useRef(serviceId);
  useEffect(() => {
    if (lastServiceIdRef.current === serviceId) return;
    lastServiceIdRef.current = serviceId;
    dispatch({
      type: "resetService",
      serviceContext: { serviceId, serviceName, servicePrice, serviceDurationMin },
    });
  }, [serviceId, serviceName, servicePrice, serviceDurationMin]);

  // Auth session — pre-fill phone + name when available
  useEffect(() => {
    let cancelled = false;
    setMeLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { user: SessionUser | null } }
          | { ok: false }
          | null;
        if (cancelled) return;
        const user = json?.ok ? (json.data.user ?? null) : null;
        setMe(user);
        if (user?.phone) {
          dispatch({ type: "setPhone", value: user.phone.replace(/\D/g, "") });
        }
        if (user?.displayName?.trim()) {
          dispatch({ type: "setName", value: user.displayName.trim() });
        }
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ServiceBookingConfig — preserved feature (photos + custom questions)
  useEffect(() => {
    let cancelled = false;
    setBookingConfigLoading(true);
    setBookingConfigError(null);
    setBookingConfig(null);
    dispatch({ type: "setReferencePhoto", assetId: null });
    setReferencePreviewUrl(null);
    setReferenceUploadError(null);

    (async () => {
      try {
        const config = await fetchPublicServiceBookingConfig(serviceId);
        if (!cancelled) setBookingConfig(config);
      } catch {
        if (!cancelled) {
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

  // URL `?bookingId=` hydration — show success card on refresh / share
  useEffect(() => {
    const id = readBookingIdFromUrl();
    if (!id || state.phase === "success") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/bookings/${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          clearBookingIdFromUrl();
          return;
        }
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { booking: RemoteBookingResponse } }
          | { ok: false }
          | null;
        if (cancelled || !json?.ok) return;
        const booking = asConfirmedBooking(json.data.booking, Boolean(me));
        if (booking) {
          dispatch({ type: "loadConfirmedBooking", booking });
        }
      } catch {
        // Silently — user can still re-create a booking.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Revoke local preview URL on unmount
  useEffect(() => {
    return () => {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
    };
  }, [referencePreviewUrl]);

  const handleReferenceUpload = useCallback(
    async (file: File) => {
      setReferenceUploadError(null);
      setReferenceUploading(true);
      dispatch({ type: "setReferencePhoto", assetId: null });
      setReferencePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      const result = await uploadBookingReference(file);
      if (!result.ok) {
        setReferenceUploadError(result.error);
      } else {
        dispatch({ type: "setReferencePhoto", assetId: result.assetId });
      }
      setReferenceUploading(false);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!state.selectedSlot) return;
    setSubmitLoading(true);
    setSubmitError(null);

    // Photo / questions validation — preserved from the legacy flow.
    if (bookingConfig?.requiresReferencePhoto && !state.referencePhotoAssetId) {
      setSubmitError(UI_TEXT.publicProfile.booking.referencePhotoRequired);
      setSubmitLoading(false);
      return;
    }
    if (bookingConfig?.questions?.length) {
      const missing = bookingConfig.questions.some(
        (q) => q.required && !state.bookingAnswers[q.id]?.trim(),
      );
      if (missing) {
        setSubmitError(UI_TEXT.publicProfile.booking.requiredQuestions);
        setSubmitLoading(false);
        return;
      }
    }

    const sessionPhone = me?.phone?.trim();
    const submitPhone = sessionPhone ? sessionPhone : toCanonicalPhone(state.clientPhone);
    if (!submitPhone || submitPhone.replace(/\D/g, "").length < 10) {
      setSubmitError(T.errorPhoneInvalid);
      setSubmitLoading(false);
      return;
    }
    const submitName =
      state.clientName.trim() ||
      me?.displayName?.trim() ||
      UI_TEXT.publicProfile.booking.clientFallbackName;
    if (!submitName) {
      setSubmitError(T.errorNameRequired);
      setSubmitLoading(false);
      return;
    }

    const answersPayload =
      bookingConfig?.questions
        ?.map((q) => {
          const value = state.bookingAnswers[q.id]?.trim() ?? "";
          if (!value) return null;
          return { questionId: q.id, questionText: q.text, answer: value };
        })
        .filter((x): x is { questionId: string; questionText: string; answer: string } => x !== null) ?? undefined;

    try {
      const res = await fetch("/api/public/bookings", {
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
          clientName: submitName,
          clientPhone: submitPhone,
          comment: state.comment.trim() || null,
          silentMode: state.silentMode,
          referencePhotoAssetId: state.referencePhotoAssetId,
          bookingAnswers: answersPayload,
        }),
      });

      if (res.status === 409) {
        dispatch({ type: "submitConflict" });
        // Rotate idempotency key so the retry isn't treated as a duplicate.
        idempotencyKeyRef.current =
          typeof crypto !== "undefined" ? crypto.randomUUID() : `bk-${Date.now()}`;
        return;
      }

      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { booking: { id: string } } }
        | { ok: false; error: { code: string; message: string } }
        | null;

      if (!res.ok || !json || !json.ok) {
        const message =
          json && !json.ok
            ? json.error.message
            : UI_TEXT.publicProfile.booking.submitFailed;
        setSubmitError(message);
        return;
      }

      // Hydrate the success card with the data we already have locally —
      // saves a roundtrip on first submit. The URL refresh path will fetch
      // /api/public/bookings/[id] for the masked phone etc.
      const fallbackConfirmation: ConfirmedBooking = {
        id: json.data.booking.id,
        status: "PENDING",
        startAtUtc: state.selectedSlot.startAtUtc,
        endAtUtc: state.selectedSlot.endAtUtc,
        serviceName,
        servicePrice:
          state.selectedSlot.isHot && typeof state.selectedSlot.discountedPrice === "number"
            ? state.selectedSlot.discountedPrice
            : servicePrice,
        providerName: "", // populated by URL refresh fetch below
        providerAddress: null,
        timezone: providerTimezone,
        clientPhoneMasked: maskRussianPhone(submitPhone),
        isAuthenticatedUser: Boolean(me),
      };

      writeBookingIdToUrl(json.data.booking.id);
      dispatch({ type: "submitSuccess", booking: fallbackConfirmation });

      // Quietly fetch the safe DTO so the success card gets the
      // provider address and proper name. Best-effort — failure leaves
      // the fallback card intact.
      void (async () => {
        try {
          const detailRes = await fetch(
            `/api/public/bookings/${encodeURIComponent(json.data.booking.id)}`,
            { cache: "no-store" },
          );
          const detail = (await detailRes.json().catch(() => null)) as
            | { ok: true; data: { booking: RemoteBookingResponse } }
            | { ok: false }
            | null;
          if (detail?.ok) {
            const enriched = asConfirmedBooking(detail.data.booking, Boolean(me), {
              serviceName,
              servicePrice,
              providerTimezone,
            });
            if (enriched) {
              dispatch({ type: "loadConfirmedBooking", booking: enriched });
            }
          }
        } catch {
          /* keep fallback */
        }
      })();
    } catch {
      setSubmitError(T.errorNetwork);
    } finally {
      setSubmitLoading(false);
    }
  }, [
    bookingConfig,
    me,
    providerId,
    providerTimezone,
    serviceId,
    serviceName,
    servicePrice,
    state,
  ]);

  const handleCancelAuthBooking = useCallback(async () => {
    if (!state.confirmedBooking) return;
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(state.confirmedBooking.id)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        // After successful cancel — clear URL state and return to selection
        // for a fresh attempt. The widget stays mounted.
        clearBookingIdFromUrl();
        dispatch({ type: "retryFromConflict" });
      }
    } catch {
      /* surface failure quietly — user still sees their booking */
    }
  }, [state.confirmedBooking]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-border-subtle bg-bg-card">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {state.phase === "selection" ? (
            <SelectionPhase
              providerId={providerId}
              providerTimezone={providerTimezone}
              serviceId={serviceId}
              serviceName={serviceName}
              servicePrice={servicePrice}
              serviceDurationMin={serviceDurationMin}
              selectedDateKey={state.selectedDateKey}
              selectedSlot={state.selectedSlot}
              onSelectDate={(dateKey) => dispatch({ type: "selectDate", dateKey })}
              onSelectSlot={(slot) => dispatch({ type: "selectSlot", slot })}
              onContinue={() => dispatch({ type: "continueToForm" })}
            />
          ) : null}

          {state.phase === "form" ? (
            <FormPhase
              me={me}
              meLoading={meLoading}
              serviceName={serviceName}
              servicePrice={servicePrice}
              serviceDurationMin={serviceDurationMin}
              providerTimezone={providerTimezone}
              selectedDateKey={state.selectedDateKey}
              selectedSlot={state.selectedSlot}
              clientName={state.clientName}
              clientPhone={state.clientPhone}
              comment={state.comment}
              silentMode={state.silentMode}
              bookingAnswers={state.bookingAnswers}
              onChangeName={(value) => dispatch({ type: "setName", value })}
              onChangePhone={(value) => dispatch({ type: "setPhone", value })}
              onChangeComment={(value) => dispatch({ type: "setComment", value })}
              onChangeSilentMode={(value) => dispatch({ type: "setSilentMode", value })}
              onChangeAnswer={(questionId, value) =>
                dispatch({ type: "setAnswer", questionId, value })
              }
              bookingConfig={bookingConfig}
              bookingConfigLoading={bookingConfigLoading}
              bookingConfigError={bookingConfigError}
              referencePreviewUrl={referencePreviewUrl}
              referenceUploading={referenceUploading}
              referenceUploadError={referenceUploadError}
              onReferenceUpload={handleReferenceUpload}
              submitLoading={submitLoading}
              submitError={submitError}
              onBack={() => dispatch({ type: "backToSelection" })}
              onSubmit={() => void handleSubmit()}
            />
          ) : null}

          {state.phase === "success" && state.confirmedBooking ? (
            <SuccessPhase
              booking={state.confirmedBooking}
              onCancel={handleCancelAuthBooking}
            />
          ) : null}

          {state.phase === "conflict" ? (
            <ConflictPhase onRetry={() => dispatch({ type: "retryFromConflict" })} />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
