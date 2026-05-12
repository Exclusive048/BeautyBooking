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
 * Thread loader (33a, slug-aware after chat-url-fix).
 *
 * Refetches when:
 *   - the active conversation slug changes
 *   - a CHAT_MESSAGE_RECEIVED notification arrives whose payload
 *     references this `conversationSlug` (other-side message) OR an
 *     unknown slug (defensive: refresh anyway)
 */
export function useConversationThread(input: {
  perspective: ChatPerspective;
  conversationSlug: string | null;
}): State & {
  refresh: () => Promise<void>;
  markRead: () => Promise<void>;
} {
  const { perspective, conversationSlug } = input;
  const [state, setState] = useState<State>({
    detail: null,
    isLoading: Boolean(conversationSlug),
    error: null,
  });

  const fetchThread = useCallback(async () => {
    if (!conversationSlug) {
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
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}?as=${perspective}`,
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
  }, [conversationSlug, perspective]);

  useEffect(() => {
    // fetchThread setState happens after await — async microtask, not
    // synchronous-in-effect. Suppressing the conservative lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    if (!conversationSlug) return;
    return subscribeNotificationEvent((event) => {
      if (event.kind !== "incoming" || !event.notification) return;
      if (event.notification.type !== "CHAT_MESSAGE_RECEIVED") return;
      const payload = event.notification.payloadJson as { conversationSlug?: unknown } | null;
      if (payload && typeof payload === "object" && "conversationSlug" in payload) {
        const incomingSlug = (payload as { conversationSlug?: unknown }).conversationSlug;
        if (typeof incomingSlug === "string" && incomingSlug !== conversationSlug) return;
      }
      void fetchThread();
    });
  }, [conversationSlug, fetchThread]);

  const markRead = useCallback(async () => {
    if (!conversationSlug) return;
    try {
      await fetch(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}/read?as=${perspective}`,
        { method: "POST" },
      );
    } catch {
      // Best-effort — UI re-fetches anyway on next focus.
    }
  }, [conversationSlug, perspective]);

  return { ...state, refresh: fetchThread, markRead };
}
