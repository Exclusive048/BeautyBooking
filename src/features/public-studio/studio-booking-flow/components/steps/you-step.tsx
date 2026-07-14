"use client";

import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";
import type { BookingUser } from "@/features/booking/lib/studio-booking";

type Props = {
  me: BookingUser | null;
  meLoading: boolean;
  guestName: string;
  guestPhone: string;
  onGuestNameChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  silentMode: boolean;
  onSilentChange: (value: boolean) => void;
  loginHref: string;
  onBack: () => void;
};

export function YouStep({
  me,
  meLoading,
  guestName,
  guestPhone,
  onGuestNameChange,
  onGuestPhoneChange,
  comment,
  onCommentChange,
  silentMode,
  onSilentChange,
  loginHref,
  onBack,
}: Props) {
  const isGuest = !meLoading && !me;

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-accent-text">
          <Phone className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-text sm:text-xl">
            {UI_TEXT.bookingWidget.youStep.title}
          </h2>
          <p className="truncate text-xs text-text-muted sm:text-sm">
            {isGuest ? UI_TEXT.bookingWidget.youStep.subtitleGuest : UI_TEXT.bookingWidget.youStep.subtitleAuth}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-text-muted">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
          {UI_TEXT.bookingWidget.youStep.back}
        </Button>
      </header>

      {isGuest ? (
        <div className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-4">
          <div>
            <label htmlFor="guest-name" className="text-xs font-medium text-text-muted">
              {UI_TEXT.bookingWidget.youStep.nameLabel}
            </label>
            <Input
              id="guest-name"
              type="text"
              autoComplete="name"
              value={guestName}
              onChange={(event) => onGuestNameChange(event.target.value)}
              placeholder={UI_TEXT.bookingWidget.youStep.namePlaceholder}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="guest-phone" className="text-xs font-medium text-text-muted">
              {UI_TEXT.bookingWidget.youStep.phoneLabel}
            </label>
            <Input
              id="guest-phone"
              type="tel"
              autoComplete="tel"
              value={guestPhone}
              onChange={(event) => onGuestPhoneChange(event.target.value)}
              placeholder={UI_TEXT.bookingWidget.youStep.phonePlaceholder}
              className="mt-1"
            />
          </div>
          <div className="text-xs text-text-muted">
            {UI_TEXT.bookingWidget.youStep.loginHint}{" "}
            <Link href={loginHref} className="font-medium text-accent-text underline-offset-2 hover:underline">
              {UI_TEXT.bookingWidget.youStep.loginCta}
            </Link>
          </div>
        </div>
      ) : me ? (
        <div className="rounded-xl border border-border-subtle bg-bg-card p-4 text-sm">
          <div className="font-semibold text-text">{me.displayName ?? me.phone ?? "—"}</div>
          {me.phone ? <div className="text-text-muted">{me.phone}</div> : null}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-bg-card p-4">
        <span
          className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 rounded-full border transition ${
            silentMode ? "border-primary/70 bg-primary/25" : "border-border-subtle bg-bg-muted/20"
          }`}
        >
          <input
            type="checkbox"
            checked={silentMode}
            onChange={(event) => onSilentChange(event.target.checked)}
            className="sr-only"
          />
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${
              silentMode ? "left-6" : "left-0.5"
            }`}
            aria-hidden
          />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text">{UI_TEXT.bookingWidget.youStep.silentLabel}</span>
          <span className="mt-1 block text-xs text-text-muted">{UI_TEXT.bookingWidget.youStep.silentHint}</span>
        </span>
      </label>

      <div>
        <label htmlFor="booking-comment" className="text-xs font-medium text-text-muted">
          {UI_TEXT.bookingWidget.youStep.commentLabel}
        </label>
        <Textarea
          id="booking-comment"
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder={UI_TEXT.bookingWidget.youStep.commentPlaceholder}
          className="mt-1 min-h-[72px]"
        />
      </div>
    </section>
  );
}
