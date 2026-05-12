"use client";

import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { ListHeader } from "@/features/chat/conversation-list/list-header";
import { ConversationRow } from "@/features/chat/conversation-list/conversation-row";
import { UI_TEXT } from "@/lib/ui/text";
import type { ConversationListItemDto, ChatPerspective } from "@/features/chat/types";

const T = UI_TEXT.chat;

type Props = {
  conversations: ConversationListItemDto[];
  activeSlug: string | null;
  onPick: (slug: string) => void;
  perspective: ChatPerspective;
  isLoading: boolean;
  viewerTimezone: string;
  className?: string;
};

export function ConversationList({
  conversations,
  activeSlug,
  onPick,
  perspective,
  isLoading,
  viewerTimezone,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (unreadOnly && c.unreadCount === 0) return false;
      if (q && !c.partner.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conversations, query, unreadOnly]);

  return (
    <aside
      className={className ?? "flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-card"}
    >
      <ListHeader
        totalUnread={totalUnread}
        query={query}
        onQueryChange={setQuery}
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        perspective={perspective}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasQuery={Boolean(query)}
            unreadOnly={unreadOnly}
            total={conversations.length}
            perspective={perspective}
          />
        ) : (
          filtered.map((conversation) => (
            <ConversationRow
              key={conversation.slug}
              conversation={conversation}
              isActive={conversation.slug === activeSlug}
              onClick={() => onPick(conversation.slug)}
              viewerTimezone={viewerTimezone}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-4 py-3">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 py-2"
          aria-hidden
        >
          <div className="h-[42px] w-[42px] shrink-0 animate-pulse rounded-full bg-bg-input" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-bg-input" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-bg-input" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasQuery,
  unreadOnly,
  total,
  perspective,
}: {
  hasQuery: boolean;
  unreadOnly: boolean;
  total: number;
  perspective: ChatPerspective;
}) {
  // Filter-driven empty state — keep tight.
  if (hasQuery || unreadOnly) {
    return (
      <div className="px-5 py-12 text-center text-sm text-text-sec">
        {T.list.emptyFiltered}
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="flex flex-col items-center px-5 py-12 text-center">
        <MessageSquare
          className="mb-3 h-10 w-10 text-text-sec/40"
          aria-hidden
          strokeWidth={1.4}
        />
        <p className="mb-1 font-display text-base text-text-main">
          {T.list.emptyTitle}
        </p>
        <p className="max-w-[220px] text-xs text-text-sec">
          {perspective === "master"
            ? T.list.emptyMasterHint
            : T.list.emptyClientHint}
        </p>
      </div>
    );
  }
  return null;
}
