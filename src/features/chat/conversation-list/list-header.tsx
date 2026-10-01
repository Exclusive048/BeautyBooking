"use client";

import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import * as UI_TEXT from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";
import { Input } from "@/components/ui/input";

const T = UI_TEXT.chat;

type Props = {
  totalUnread: number;
  query: string;
  onQueryChange: (value: string) => void;
  unreadOnly: boolean;
  onUnreadOnlyChange: (value: boolean) => void;
  perspective: ChatPerspective;
};

export function ListHeader({
  totalUnread,
  query,
  onQueryChange,
  unreadOnly,
  onUnreadOnlyChange,
}: Props) {
  return (
    <div className="space-y-3 border-b border-border-subtle bg-bg-card px-4 pb-3 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-base text-text-main">
          {T.list.heading}
          {totalUnread > 0 ? (
            <span className="bg-brand-gradient inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-2xs font-semibold text-white">
              {totalUnread}
            </span>
          ) : null}
        </h2>
      </div>
      {/* 29.09 доработки · 31: окно списка (`chat/conversation-window.ts`). */}
      <p className="-mt-2 text-xs text-text-sec">{T.list.windowNote}</p>

      <label className="relative block">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-sec"
          strokeWidth={1.8}
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={T.list.searchPlaceholder}
          className="h-9 rounded-lg py-1.5 pl-8 pr-3"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-text-sec">
        <Checkbox
          size="sm"
          checked={unreadOnly}
          onChange={(event) => onUnreadOnlyChange(event.target.checked)}
        />
        {T.list.unreadOnly}
      </label>
    </div>
  );
}
