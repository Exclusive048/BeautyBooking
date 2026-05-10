"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/features/chat/chat-window/message-bubble";
import { DaySeparator } from "@/features/chat/chat-window/day-separator";
import { UI_TEXT } from "@/lib/ui/text";
import type { ChatPerspective, ThreadItemDto } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  items: ThreadItemDto[];
  perspective: ChatPerspective;
  viewerTimezone: string;
};

export function Thread({ items, perspective, viewerTimezone }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content. We track the messages count
  // so adding a single new message animates smoothly to bottom — same
  // semantics as the legacy <BookingChat>.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-text-sec">
        {T.thread.empty}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-5 md:px-5"
    >
      {items.map((item) => {
        if (item.type === "day_separator") {
          return (
            <DaySeparator
              key={item.id}
              dateKey={item.dateKey}
              viewerTimezone={viewerTimezone}
            />
          );
        }
        const isMine =
          perspective === "master"
            ? item.senderType === "MASTER"
            : item.senderType === "CLIENT";
        return (
          <MessageBubble
            key={item.id}
            message={item}
            isMine={isMine}
            viewerTimezone={viewerTimezone}
          />
        );
      })}
    </div>
  );
}
