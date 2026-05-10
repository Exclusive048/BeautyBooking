"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { ConversationListItemDto, ChatPerspective } from "@/features/chat/types";

type State = {
  conversations: ConversationListItemDto[];
  isLoading: boolean;
  error: string | null;
};

/**
 * Conversation list fetcher (33a).
 *
 * Re-fetches when a CHAT_MESSAGE_RECEIVED notification arrives on
 * the existing SSE bus — the simplest possible real-time strategy
 * that reuses production infrastructure end-to-end.
 */
export function useConversations(perspective: ChatPerspective): State & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<State>({
    conversations: [],
    isLoading: true,
    error: null,
  });

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/conversations?as=${perspective}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { conversations: ConversationListItemDto[] } }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !json.ok) {
        setState({
          conversations: [],
          isLoading: false,
          error: json && !json.ok ? json.error.message : "Не удалось загрузить переписки.",
        });
        return;
      }
      setState({ conversations: json.data.conversations, isLoading: false, error: null });
    } catch {
      setState({
        conversations: [],
        isLoading: false,
        error: "Сетевая ошибка. Попробуйте обновить страницу.",
      });
    }
  }, [perspective]);

  useEffect(() => {
    // setState happens after await inside fetchList — async microtask,
    // not synchronous-in-effect. Suppressing the conservative lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    return subscribeNotificationEvent((event) => {
      if (event.kind !== "incoming" || !event.notification) return;
      if (event.notification.type !== "CHAT_MESSAGE_RECEIVED") return;
      void fetchList();
    });
  }, [fetchList]);

  return {
    ...state,
    refresh: fetchList,
  };
}
