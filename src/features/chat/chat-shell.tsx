"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ConversationList } from "@/features/chat/conversation-list/conversation-list";
import { ChatWindow } from "@/features/chat/chat-window/chat-window";
import { useConversations } from "@/features/chat/hooks/use-conversations";
import { UI_TEXT } from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import type { ChatPerspective } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  perspective: ChatPerspective;
};

/**
 * Universal chat surface (33a).
 *
 * Same component runs in both the master and the client cabinet —
 * `perspective` switches the role mapping for messages and the
 * partner-side metadata (master sees "Клиент", client sees "Мастер").
 *
 * Desktop layout: 320 px list on the left + flexible window. Mobile
 * (<768 px): list takes the full screen, then tap a row → window
 * covers the list with a back arrow in the header.
 */
export function ChatShell({ perspective }: Props) {
  const searchParams = useSearchParams();
  const { conversations, isLoading } = useConversations(perspective);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [mobileWindowOpen, setMobileWindowOpen] = useState(false);

  const viewerTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
    } catch {
      return "Europe/Moscow";
    }
  }, []);

  // Honor `?c=<slug>` from incoming notification click-throughs.
  // chat-url-fix replaced the previous `?key=<providerId:clientUserId>`
  // form so URLs no longer leak internal cuids.
  useEffect(() => {
    const hinted = searchParams.get("c");
    if (hinted) {
      setActiveSlug(hinted);
      setMobileWindowOpen(true);
    }
  }, [searchParams]);

  // First-load auto-select: most recently active conversation.
  useEffect(() => {
    if (activeSlug) return;
    if (conversations.length === 0) return;
    setActiveSlug(conversations[0]?.slug ?? null);
  }, [activeSlug, conversations]);

  function handlePick(slug: string) {
    setActiveSlug(slug);
    setMobileWindowOpen(true);
  }

  function handleMobileBack() {
    setMobileWindowOpen(false);
  }

  const totalConversations = conversations.length;

  return (
    <div className="flex h-[calc(100vh-var(--topbar-h,4rem)-6rem)] min-h-[560px] overflow-hidden rounded-2xl border border-border-subtle bg-bg-card shadow-sm">
      <ConversationList
        conversations={conversations}
        activeSlug={activeSlug}
        onPick={handlePick}
        perspective={perspective}
        isLoading={isLoading}
        viewerTimezone={viewerTimezone}
        className={cn(
          "flex min-h-0 flex-col border-r border-border-subtle bg-bg-card md:w-[320px] md:shrink-0",
          mobileWindowOpen ? "hidden md:flex" : "flex w-full",
        )}
      />

      <div
        className={cn(
          "min-w-0 flex-1",
          !activeSlug && totalConversations === 0
            ? "flex items-center justify-center"
            : "flex flex-col",
          mobileWindowOpen ? "flex" : "hidden md:flex",
        )}
      >
        {activeSlug ? (
          <ChatWindow
            perspective={perspective}
            conversationSlug={activeSlug}
            viewerTimezone={viewerTimezone}
            onMobileBack={handleMobileBack}
          />
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-sec">
            {T.shell.loading}
          </div>
        ) : totalConversations === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <Inbox className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden strokeWidth={1.4} />
            <p className="mb-1 font-display text-base text-text-main">
              {T.shell.emptyTitle}
            </p>
            <p className="max-w-xs text-sm text-text-sec">
              {perspective === "master"
                ? T.shell.emptyMaster
                : T.shell.emptyClient}
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden strokeWidth={1.4} />
            <p className="text-sm text-text-sec">{T.shell.pickConversation}</p>
          </div>
        )}
      </div>
    </div>
  );
}
