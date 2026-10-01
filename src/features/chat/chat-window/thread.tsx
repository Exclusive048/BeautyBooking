"use client";

import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MessageBubble } from "@/features/chat/chat-window/message-bubble";
import { DaySeparator } from "@/features/chat/chat-window/day-separator";
import { SystemMessage } from "@/features/chat/chat-window/system-message";
import * as UI_TEXT from "@/lib/ui/text";
import type { ChatPerspective, ThreadItemDto } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  items: ThreadItemDto[];
  perspective: ChatPerspective;
  viewerTimezone: string;
  /** 29.09 доработки · 31: есть более ранние сообщения («Показать раньше»). */
  hasOlder?: boolean;
  isLoadingOlder?: boolean;
  /** Подгрузить ранние; возвращает текст ошибки или null. */
  onLoadOlder?: () => Promise<string | null>;
};

export function Thread({ items, perspective, viewerTimezone, hasOlder, isLoadingOlder, onLoadOlder }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const firstId = items[0]?.id;
  const lastId = items[items.length - 1]?.id;
  // Расстояние от низа ленты до видимой области в момент нажатия «Показать
  // раньше» — после вставки ранних сообщений сверху читатель остаётся там же.
  const anchorFromBottom = useRef<number | null>(null);
  const seenLastId = useRef<string | undefined>(undefined);

  // Новое сообщение внизу (или первая загрузка) — прокрутка вниз, как в
  // легаси <BookingChat>. Ранние сообщения, вставленные сверху, ленту не
  // дёргают: прежде прокрутка шла на каждое изменение числа элементов, и
  // «Показать раньше» уводило бы вниз.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (seenLastId.current !== lastId) {
      el.scrollTop = el.scrollHeight;
    } else if (anchorFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - anchorFromBottom.current;
    }
    anchorFromBottom.current = null;
    seenLastId.current = lastId;
  }, [firstId, lastId]);

  const showEarlier = async () => {
    const el = scrollerRef.current;
    if (el) anchorFromBottom.current = el.scrollHeight - el.scrollTop;
    const failure = await onLoadOlder?.();
    if (failure) toast.error(failure);
  };

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
      data-testid="chat-thread"
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-5 md:px-5"
    >
      {hasOlder ? (
        <div className="flex justify-center pb-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void showEarlier()}
            disabled={isLoadingOlder}
            data-testid="chat-thread-show-earlier"
          >
            {isLoadingOlder ? T.thread.loadingEarlier : T.thread.showEarlier}
          </Button>
        </div>
      ) : null}
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
        if (item.senderType === "SYSTEM") {
          return (
            <SystemMessage
              key={item.id}
              message={item}
              perspective={perspective}
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
