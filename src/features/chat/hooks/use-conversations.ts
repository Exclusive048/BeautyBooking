"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { ConversationListItemDto, ChatPerspective } from "@/features/chat/types";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

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
      const data = await fetchJsonWithAuth<{ conversations: ConversationListItemDto[] }>(
        `/api/chat/conversations?as=${perspective}`,
        { cache: "no-store" },
      );
      setState({ conversations: data.conversations, isLoading: false, error: null });
    } catch (error) {
      setState({
        conversations: [],
        isLoading: false,
        error:
          error instanceof ApiClientError
            ? serverMessageOr(error, UI_TEXT.chat.errors.listLoadFailed)
            : UI_TEXT.chat.errors.offlineReload,
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
