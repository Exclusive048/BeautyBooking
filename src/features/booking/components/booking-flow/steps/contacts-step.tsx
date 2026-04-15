"use client";

import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { UI_TEXT } from "@/lib/ui/text";
import type { ServiceBookingConfig } from "@/features/booking/lib/booking-config";

const tB = UI_TEXT.publicProfile.booking;

export type ContactsFields = {
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  bookingAnswers: Record<string, string>;
};

type MeUser = { displayName: string | null; phone: string | null };

type Props = {
  me: MeUser | null;
  meLoading: boolean;
  clientPhone: string;
  comment: string;
  silentMode: boolean;
  bookingAnswers: Record<string, string>;
  referencePreviewUrl: string | null;
  referenceUploading: boolean;
  referenceUploadError: string | null;
  bookingConfig: ServiceBookingConfig | null;
  bookingConfigLoading: boolean;
  bookingConfigError: string | null;
  onChangePhone: (value: string) => void;
  onChangeComment: (value: string) => void;
  onChangeSilentMode: (value: boolean) => void;
  onChangeAnswer: (questionId: string, value: string) => void;
  onReferenceUpload: (file: File) => void;
};

function buildLoginUrl(): string {
  if (typeof window === "undefined") return "/login";
  const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}

export function ContactsStep({
  me,
  meLoading,
  clientPhone,
  comment,
  silentMode,
  bookingAnswers,
  referencePreviewUrl,
  referenceUploading,
  referenceUploadError,
  bookingConfig,
  bookingConfigLoading,
  bookingConfigError,
  onChangePhone,
  onChangeComment,
  onChangeSilentMode,
  onChangeAnswer,
  onReferenceUpload,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Phone / Auth */}
      {meLoading ? (
        <p className="text-sm text-text-sec">{UI_TEXT.common.loading}</p>
      ) : me?.phone ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 px-4 py-3 text-sm">
          <span className="text-text-sec">{tB.bookingOnPhone}</span>{" "}
          <span className="font-semibold text-text-main">{me.phone}</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-text-main">{tB.authRequiredTitle}</p>
            <p className="mt-0.5 text-xs text-text-sec">{tB.authRequiredHint}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-sec">{tB.phoneLabel}</label>
            <Input
              type="tel"
              value={clientPhone}
              onChange={(e) => onChangePhone(e.target.value)}
              placeholder={tB.phonePlaceholder}
            />
          </div>
          <a
            href={buildLoginUrl()}
            className="flex w-full items-center justify-center rounded-xl border border-border-subtle bg-bg-card px-3 py-2.5 text-sm font-semibold text-text-main transition hover:shadow-card"
          >
            {tB.loginAndContinue}
          </a>
        </div>
      )}

      {/* Silent mode */}
      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-input/70 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-main">{tB.silentModeTitle}</p>
          <p className="mt-0.5 text-xs text-text-sec">{tB.silentModeDesc}</p>
        </div>
        <Switch
          checked={silentMode}
          onCheckedChange={onChangeSilentMode}
          className="mt-0.5 shrink-0"
          aria-label={tB.silentModeAria}
        />
      </label>

      {/* Comment */}
      <div>
        <label className="mb-1.5 block text-xs text-text-sec">{tB.comment}</label>
        <Textarea
          value={comment}
          onChange={(e) => onChangeComment(e.target.value)}
          placeholder={tB.commentPlaceholder}
          className="min-h-[80px]"
        />
      </div>

      {/* Booking config (reference photo + questions) */}
      {bookingConfigLoading && (
        <p className="text-xs text-text-sec">{tB.bookingConfigLoading}</p>
      )}
      {bookingConfigError && (
        <p className="text-xs text-rose-500 dark:text-rose-400">{bookingConfigError}</p>
      )}
      {bookingConfig && (bookingConfig.requiresReferencePhoto || bookingConfig.questions.length > 0) && (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4 space-y-4">
          <p className="text-sm font-semibold text-text-main">{tB.bookingConfigTitle}</p>

          {bookingConfig.requiresReferencePhoto && (
            <div>
              <label className="mb-1.5 block text-xs text-text-sec">
                {tB.referencePhotoLabel} <span className="text-rose-400">*</span>
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReferenceUpload(file);
                }}
                disabled={referenceUploading}
                className="block w-full text-xs text-text-sec"
              />
              {referenceUploading && (
                <p className="mt-1.5 text-xs text-text-sec">{tB.referencePhotoUploading}</p>
              )}
              {referenceUploadError && (
                <p className="mt-1.5 text-xs text-rose-400">{referenceUploadError}</p>
              )}
              {referencePreviewUrl && (
                <div className="relative mt-3 h-44 w-full overflow-hidden rounded-xl">
                  <Image
                    src={referencePreviewUrl}
                    alt={tB.referencePhotoAlt}
                    fill
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {bookingConfig.questions.length > 0 && (
            <div className="space-y-3">
              {bookingConfig.questions.map((q) => (
                <div key={q.id}>
                  <label className="mb-1.5 block text-sm text-text-main">
                    {q.text}
                    {q.required && <span className="text-rose-400"> *</span>}
                  </label>
                  <Input
                    value={bookingAnswers[q.id] ?? ""}
                    onChange={(e) => onChangeAnswer(q.id, e.target.value)}
                    placeholder={tB.bookingAnswerPlaceholder}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
