"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { ConversationThreadDto, ChatPerspective } from "@/features/chat/types";

type State = {
  detail: ConversationThreadDto | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * Thread loader (33a).
 *
 * Refetches when:
 *   - the active conversation key changes
 *   - a CHAT_MESSAGE_RECEIVED notification arrives whose payload
 *     references this conversationKey (other-side message) OR an
 *     unknown key (defensive: refresh anyway)
 */
export function useConversationThread(input: {
  perspective: ChatPerspective;
  conversationKey: string | null;
}): State & {
  refresh: () => Promise<void>;
  markRead: () => Promise<void>;
} {
  const { perspective, conversationKey } = input;
  const [state, setState] = useState<State>({
    detail: null,
    isLoading: Boolean(conversationKey),
    error: null,
  });

  const fetchThread = useCallback(async () => {
    if (!conversationKey) {
      setState({ detail: null, isLoading: false, error: null });
      return;
    }
    // Note: we intentionally do not flip `isLoading: true` here. The
    // previous thread stays visible while the new one loads, which
    // avoids a content flash on background refetches triggered by
    // SSE events. Initial-load loading is set in the initial state.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Europe/Moscow";
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(conversationKey)}?as=${perspective}`,
        {
          cache: "no-store",
          headers: { "x-tz": tz },
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: ConversationThreadDto }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !json.ok) {
        setState({
          detail: null,
          isLoading: false,
          error: json && !json.ok ? json.error.message : "Не удалось загрузить переписку.",
        });
        return;
      }
      setState({ detail: json.data, isLoading: false, error: null });
    } catch {
      setState({
        detail: null,
        isLoading: false,
        error: "Сетевая ошибка. Попробуйте позже.",
      });
    }
  }, [conversationKey, perspective]);

  useEffect(() => {
    // fetchThread setState happens after await — async microtask, not
    // synchronous-in-effect. Suppressing the conservative lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (!conversationKey) return;
    return subscribeNotificationEvent((event) => {
      if (event.kind !== "incoming" || !event.notification) return;
      if (event.notification.type !== "CHAT_MESSAGE_RECEIVED") return;
      const payload = event.notification.payloadJson as { conversationKey?: unknown } | null;
      if (payload && typeof payload === "object" && "conversationKey" in payload) {
        const incomingKey = (payload as { conversationKey?: unknown }).conversationKey;
        if (typeof incomingKey === "string" && incomingKey !== conversationKey) return;
      }
      void fetchThread();
    });
  }, [conversationKey, fetchThread]);

  const markRead = useCallback(async () => {
    if (!conversationKey) return;
    try {
      await fetch(
        `/api/chat/threads/${encodeURIComponent(conversationKey)}/read?as=${perspective}`,
        { method: "POST" },
      );
    } catch {
      // Best-effort — UI re-fetches anyway on next focus.
    }
  }, [conversationKey, perspective]);

  return { ...state, refresh: fetchThread, markRead };
}
