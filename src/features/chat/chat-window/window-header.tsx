"use client";

import { Calendar, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { ChatPerspective, ConversationPartnerDto } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  partner: ConversationPartnerDto;
  perspective: ChatPerspective;
  canSend: boolean;
  hasOpenBooking: boolean;
  onMobileBack?: () => void;
};

function initialOf(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

export function WindowHeader({
  partner,
  perspective,
  canSend,
  hasOpenBooking,
  onMobileBack,
}: Props) {
  const statusLabel = hasOpenBooking ? T.header.statusOpen : T.header.statusClosed;
  const statusClass = hasOpenBooking
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-text-sec";

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-card px-4 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {onMobileBack ? (
          <button
            type="button"
            onClick={onMobileBack}
            className="md:hidden -ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-sec hover:text-text-main"
            aria-label={T.header.back}
          >
            ‹
          </button>
        ) : null}
        <div className="relative shrink-0">
          {partner.avatarUrl ? (
            <Image
              src={partner.avatarUrl}
              alt={partner.name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white">
              {initialOf(partner.name)}
            </div>
          )}
          {hasOpenBooking ? (
            <span
              aria-hidden
              className="absolute -bottom-px -right-px h-[11px] w-[11px] rounded-full border-2 border-bg-card bg-emerald-500"
            />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold text-text-main">
            {partner.name}
          </div>
          <p className="mt-px truncate text-xs">
            <span className={statusClass}>{statusLabel}</span>
            <span className="text-text-sec"> · {partner.roleSummary}</span>
            {!canSend ? (
              <span className="ml-1 text-text-sec/80">
                · {perspective === "master" ? T.header.composeHintMaster : T.header.composeHintClient}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {perspective === "client" && partner.bookingUrl ? (
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={partner.bookingUrl}>
              <Calendar className="h-4 w-4" aria-hidden strokeWidth={1.6} />
              <span className="hidden sm:inline">{T.header.bookCta}</span>
            </Link>
          </Button>
        ) : null}
        {/* fix-02: master-side «Открыть запись» button removed — it
            linked to a kanban page без context. Re-add once a real
            booking-detail page ships (backlog). */}
        {partner.phone ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            aria-label={T.header.call}
          >
            <a href={`tel:${partner.phone}`}>
              <Phone className="h-4 w-4" aria-hidden strokeWidth={1.6} />
            </a>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
