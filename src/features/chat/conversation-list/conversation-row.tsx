"use client";

import { Check } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { formatRowTime } from "@/features/chat/lib/format-time";
import { UI_TEXT } from "@/lib/ui/text";
import type { ConversationListItemDto } from "@/features/chat/types";

type Props = {
  conversation: ConversationListItemDto;
  isActive: boolean;
  onClick: () => void;
  viewerTimezone: string;
};

const T = UI_TEXT.chat;

function initialOf(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

export function ConversationRow({ conversation, isActive, onClick, viewerTimezone }: Props) {
  const partner = conversation.partner;
  const lastTime = conversation.lastMessage
    ? formatRowTime(conversation.lastMessage.createdAt, viewerTimezone)
    : "";
  const hasUnread = conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-start gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors",
        isActive ? "bg-bg-page" : "hover:bg-bg-input/50",
      )}
    >
      {isActive ? (
        <span
          aria-hidden
          className="bg-brand-gradient absolute bottom-3 left-0 top-3 w-[3px] rounded-r"
        />
      ) : null}

      <div className="relative shrink-0">
        {partner.avatarUrl ? (
          <Image
            src={partner.avatarUrl}
            alt={partner.name}
            width={42}
            height={42}
            className="h-[42px] w-[42px] rounded-full object-cover"
          />
        ) : (
          <div className="bg-brand-gradient flex h-[42px] w-[42px] items-center justify-center rounded-full text-base font-semibold text-white">
            {initialOf(partner.name)}
          </div>
        )}
        {conversation.hasOpenBooking ? (
          <span
            aria-hidden
            className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-bg-card bg-emerald-500"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13.5px] font-semibold text-text-main">
            {partner.name}
          </p>
          {lastTime ? (
            <span
              className={cn(
                "shrink-0 font-mono text-[11px]",
                hasUnread ? "text-primary" : "text-text-sec",
              )}
            >
              {lastTime}
            </span>
          ) : null}
        </div>
        <p className="mt-px truncate text-[11.5px] text-text-sec">
          {partner.roleSummary}
        </p>
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 text-[12.5px]",
            hasUnread ? "font-medium text-text-main" : "text-text-main/80",
          )}
        >
          {conversation.lastMessage?.mine ? (
            <Check className="h-3 w-3 shrink-0 text-text-sec" aria-hidden strokeWidth={2} />
          ) : null}
          <span className="flex-1 truncate">
            {conversation.lastMessage?.body ?? T.row.empty}
          </span>
          {hasUnread ? (
            <span className="bg-brand-gradient inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-semibold text-white">
              {conversation.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
