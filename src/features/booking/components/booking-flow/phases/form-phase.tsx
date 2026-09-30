"use client";

import { ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import Image from "next/image";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { PhoneInput } from "@/features/booking/components/booking-flow/components/phone-input";
import { SummaryBlock } from "@/features/booking/components/booking-flow/components/summary-block";
import { Footnote } from "@/features/booking/components/booking-flow/components/footnote";
import { LegalConsentGroup } from "@/features/auth/components/legal-consent-group";
import { hasRequiredConsents, type ConsentFlags } from "@/lib/legal/consent-flags";
import type { ServiceBookingConfig } from "@/features/booking/lib/booking-config";
import type { BookingFlowSlot } from "@/features/booking/components/booking-flow/types";
import { FileInput } from "@/components/ui/file-input";

const T = UI_TEXT.publicProfile.bookingWidget;
const TB = UI_TEXT.publicProfile.booking;

type SessionUser = { displayName: string | null; phone: string | null };

type Props = {
  // Session
  me: SessionUser | null;
  meLoading: boolean;

  // Service / summary context
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  providerTimezone: string;
  selectedDateKey: string | null;
  selectedSlot: BookingFlowSlot | null;

  // Form values
  clientName: string;
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  bookingAnswers: Record<string, string>;
  onChangeName: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangeComment: (value: string) => void;
  onChangeSilentMode: (value: boolean) => void;
  onChangeAnswer: (questionId: string, value: string) => void;

  // ServiceBookingConfig (photo + questions — preserved feature)
  bookingConfig: ServiceBookingConfig | null;
  bookingConfigLoading: boolean;
  bookingConfigError: string | null;
  referencePreviewUrl: string | null;
  referenceUploading: boolean;
  referenceUploadError: string | null;
  onReferenceUpload: (file: File) => void;

  // RKN-FIX-02 — guest consent (152-ФЗ ст. 9 в ред. 156-ФЗ). Shown only to
  // guests: a signed-in client consented at registration, and re-consent on a
  // document bump happens at login, not mid-booking.
  consent: ConsentFlags;
  onChangeConsent: (next: ConsentFlags) => void;

  // Submit
  submitLoading: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
};

/**
 * Phase 2 — contact + comment + (when the master configured it) the
 * reference-photo + custom-question block. Layout is intentionally
 * single-column compact so the widget still fits a 380 px sidebar.
 *
 * ServiceBookingConfig blocks (photo upload, custom questions) and
 * silent-mode toggle are preserved verbatim from the previous flow —
 * these are customer-research-validated features per the redesign
 * brief, not optional polish.
 */
export function FormPhase({
  me,
  meLoading,
  serviceName,
  servicePrice,
  serviceDurationMin,
  providerTimezone,
  selectedDateKey,
  selectedSlot,
  clientName,
  clientPhone,
  comment,
  silentMode,
  bookingAnswers,
  onChangeName,
  onChangePhone,
  onChangeComment,
  onChangeSilentMode,
  onChangeAnswer,
  bookingConfig,
  bookingConfigLoading,
  bookingConfigError,
  referencePreviewUrl,
  referenceUploading,
  referenceUploadError,
  onReferenceUpload,
  consent,
  onChangeConsent,
  submitLoading,
  submitError,
  onBack,
  onSubmit,
}: Props) {
  const silentLabelId = useId();
  const referencePhotoId = useId();
  const isAuthPhone = Boolean(me?.phone);
  const hasName = clientName.trim().length > 0;
  const hasPhone = clientPhone.trim().length >= 10;
  // A guest is anyone without a session — `me` is resolved before this phase
  // renders (`meLoading` guards the flicker).
  const isGuest = !meLoading && !me;
  const consentReady = !isGuest || hasRequiredConsents(consent);
  const canSubmit =
    hasName && hasPhone && consentReady && !submitLoading && !referenceUploading;

  return (
    <div className="space-y-4 p-5">
      <Button variant="wrapper"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-text-sec transition hover:text-text-main"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden strokeWidth={2} />
        {T.formBackToSelection}
      </Button>

      <div className="text-[11px] font-medium uppercase tracking-wider text-text-sec">
        {T.formContactsEyebrow}
      </div>

      {meLoading ? (
        <p className="text-sm text-text-sec">{UI_TEXT.common.loading}</p>
      ) : null}

      {/* Phone — auth user shows the read-only chip; guest shows the masked input */}
      {!meLoading && isAuthPhone ? (
        <div className="rounded-xl border border-border-subtle bg-bg-input/70 px-3 py-2.5 text-sm">
          <span className="text-text-sec">{TB.bookingOnPhone}</span>{" "}
          <span className="font-semibold text-text-main">{me?.phone}</span>
        </div>
      ) : (
        <PhoneInput
          value={clientPhone}
          onChange={onChangePhone}
          required
          autoFocus={!isAuthPhone}
        />
      )}

      <div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.nameLabel}
            <span className="ml-0.5 text-danger-text">*</span>
          </span>
          <Input
            value={clientName}
            onChange={(event) => onChangeName(event.target.value)}
            placeholder={T.namePlaceholder}
            maxLength={120}
          />
          {/* FIX-NAME-HINT: общий ключ на все поверхности записи. */}
          <span className="mt-1 block text-xs text-text-sec">
            {UI_TEXT.common.ownNameHint}
          </span>
        </label>
      </div>

      <div>
        <label className="block">
          <span className="mb-1 block text-xs text-text-sec">{T.commentLabel}</span>
          <Textarea
            value={comment}
            onChange={(event) => onChangeComment(event.target.value)}
            placeholder={T.commentPlaceholder}
            className="min-h-[64px]"
            maxLength={500}
          />
        </label>
      </div>

      {/* Silent mode — niche but preserved */}
      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border-subtle bg-bg-input/70 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-main">{TB.silentModeTitle}</p>
          <p className="mt-0.5 text-xs text-text-sec">{TB.silentModeDesc}</p>
        </div>
        <Switch
          checked={silentMode}
          onCheckedChange={onChangeSilentMode}
          aria-labelledby={silentLabelId}
          aria-label={TB.silentModeAria}
          className="mt-0.5 shrink-0"
        />
      </label>

      {/* ServiceBookingConfig — reference photo + custom questions (preserved) */}
      {bookingConfigLoading ? (
        <p className="text-xs text-text-sec">{TB.bookingConfigLoading}</p>
      ) : null}
      {bookingConfigError ? (
        <p className="text-xs text-danger-text">{bookingConfigError}</p>
      ) : null}
      {bookingConfig &&
      (bookingConfig.requiresReferencePhoto || bookingConfig.questions.length > 0) ? (
        <div className="space-y-3 rounded-xl border border-border-subtle bg-bg-input/70 p-3">
          <p className="text-sm font-semibold text-text-main">
            {TB.bookingConfigTitle}
          </p>

          {bookingConfig.requiresReferencePhoto ? (
            <div>
              <p className="mb-1.5 block text-xs text-text-sec">
                {TB.referencePhotoLabel} <span className="text-danger-text">*</span>
              </p>
              <label htmlFor={referencePhotoId} className="inline-block">
                <FileInput
                  id={referencePhotoId}
                  mode="label-target"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onReferenceUpload(file);
                  }}
                  disabled={referenceUploading}
                  className="peer"
                />
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary-glow/45 peer-disabled:pointer-events-none peer-disabled:opacity-50"
                >
                  <span>{TB.referencePhotoPick}</span>
                </Button>
              </label>
              {referenceUploading ? (
                <p className="mt-1.5 text-xs text-text-sec">{TB.referencePhotoUploading}</p>
              ) : null}
              {referenceUploadError ? (
                <p className="mt-1.5 text-xs text-danger-text">{referenceUploadError}</p>
              ) : null}
              {referencePreviewUrl ? (
                <div className="relative mt-3 h-40 w-full overflow-hidden rounded-lg">
                  <Image
                    src={referencePreviewUrl}
                    alt={TB.referencePhotoAlt}
                    fill
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="object-cover"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {bookingConfig.questions.length > 0 ? (
            <div className="space-y-2.5">
              {bookingConfig.questions.map((question) => (
                <div key={question.id}>
                  <label className="mb-1 block text-sm text-text-main">
                    {question.text}
                    {question.required ? <span className="text-danger-text"> *</span> : null}
                  </label>
                  <Input
                    value={bookingAnswers[question.id] ?? ""}
                    onChange={(event) => onChangeAnswer(question.id, event.target.value)}
                    placeholder={TB.bookingAnswerPlaceholder}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <SummaryBlock
        compact
        serviceName={serviceName}
        servicePrice={servicePrice}
        serviceDurationMin={serviceDurationMin}
        slot={selectedSlot}
        dateKey={selectedDateKey}
        providerTimezone={providerTimezone}
      />

      {/* RKN-FIX-02 — directly above the CTA, so the act of consenting and the
          act of booking read as one decision. Guests only. */}
      {isGuest ? (
        <LegalConsentGroup compact value={consent} onChange={onChangeConsent} />
      ) : null}

      {submitError ? (
        <p role="alert" className="text-sm text-danger-text">
          {submitError}
        </p>
      ) : null}

      <Button
        size="lg"
        disabled={!canSubmit}
        onClick={onSubmit}
        data-testid="booking-submit"
        className={cn("w-full gap-1.5", submitLoading && "opacity-90")}
      >
        {submitLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        {T.submitCta}
        {!submitLoading ? (
          <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        ) : null}
      </Button>

      <Footnote variant="form" />
    </div>
  );
}
