"use client";

import { useEffect } from "react";
import { WindowHeader } from "@/features/chat/chat-window/window-header";
import { Thread } from "@/features/chat/chat-window/thread";
import { Composer } from "@/features/chat/composer/composer";
import { useConversationThread } from "@/features/chat/hooks/use-conversation-thread";
import * as UI_TEXT from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.chat;

type Props = {
  perspective: ChatPerspective;
  conversationSlug: string;
  viewerTimezone: string;
  onMobileBack?: () => void;
  /**
   * FIX-EXP-CHAT-UX (EXP-012): revalidate the conversation list on send. The
   * sender doesn't receive a CHAT_MESSAGE_RECEIVED for their own message, so
   * the first message in a new thread would otherwise never reach the list.
   */
  onMessageSent?: () => void;
};

export function ChatWindow({
  perspective,
  conversationSlug,
  viewerTimezone,
  onMobileBack,
  onMessageSent,
}: Props) {
  const { detail, isLoading, error, refresh, markRead } = useConversationThread({
    perspective,
    conversationSlug,
  });

  // Auto-mark read on mount + each time the slug flips.
  useEffect(() => {
    void markRead();
  }, [markRead, conversationSlug]);

  if (error) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-bg-page p-8 text-center text-sm text-text-sec">
        <div>
          <p className="mb-3">{error}</p>
          <Button variant="wrapper"
            onClick={() => void refresh()}
            className="text-accent-text underline-offset-2 hover:underline"
          >
            {T.thread.retry}
          </Button>
        </div>
      </section>
    );
  }

  if (isLoading && !detail) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-bg-page">
        <div className="h-[68px] shrink-0 animate-pulse border-b border-border-subtle bg-bg-card" />
        <div className="flex-1 animate-pulse p-5" />
        <div className="h-20 shrink-0 animate-pulse border-t border-border-subtle bg-bg-card" />
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-bg-page p-8 text-center text-sm text-text-sec">
        {T.thread.notFound}
      </section>
    );
  }

  const disabledHint = detail.readonlyOnly
    ? T.composer.disabledReadonly
    : perspective === "master"
      ? T.composer.disabledMaster
      : T.composer.disabledClient;

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg-page">
      <WindowHeader
        partner={detail.partner}
        perspective={perspective}
        canSend={detail.canSend}
        hasOpenBooking={Boolean(detail.openBookingId)}
        onMobileBack={onMobileBack}
      />
      <Thread items={detail.thread} perspective={perspective} viewerTimezone={viewerTimezone} />
      <Composer
        perspective={perspective}
        conversationSlug={conversationSlug}
        canSend={detail.canSend}
        disabledHint={disabledHint}
        onSent={() => {
          // Refresh the active thread (right pane) AND revalidate the
          // conversation list (left pane) — EXP-012: a new thread's first
          // message must surface in the list without a manual reload.
          void refresh();
          onMessageSent?.();
        }}
      />
    </section>
  );
}
