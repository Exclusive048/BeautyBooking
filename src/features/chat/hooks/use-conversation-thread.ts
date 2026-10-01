"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { ConversationThreadDto, ChatPerspective } from "@/features/chat/types";
import * as UI_TEXT from "@/lib/ui/text";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { getViewerTimeZone } from "@/lib/time/use-viewer-timezone";
import { mergeThreadItems } from "@/features/chat/lib/thread-merge";

type State = {
  detail: ConversationThreadDto | null;
  isLoading: boolean;
  error: string | null;
  isLoadingOlder: boolean;
};

/**
 * Thread loader (33a, slug-aware after chat-url-fix).
 *
 * Refetches when:
 *   - the active conversation slug changes
 *   - a CHAT_MESSAGE_RECEIVED notification arrives whose payload
 *     references this `conversationSlug` (other-side message) OR an
 *     unknown slug (defensive: refresh anyway)
 *
 * 29.09 доработки · 31: сервер отдаёт последние 100 сообщений и курсор более
 * ранних. Перезапрос свежей страницы не заменяет ленту, а объединяется с уже
 * загруженным (`mergeThreadItems`), и курсор остаётся у самой ранней
 * загруженной страницы — иначе новое сообщение сдвигало бы окно «последние
 * 100» и между страницами появлялась бы дыра.
 */
export function useConversationThread(input: {
  perspective: ChatPerspective;
  conversationSlug: string | null;
}): State & {
  refresh: () => Promise<void>;
  markRead: () => Promise<void>;
  /** Подгрузить более ранние сообщения; возвращает текст ошибки или null. */
  loadOlder: () => Promise<string | null>;
} {
  const { perspective, conversationSlug } = input;
  const router = useRouter();
  const [state, setState] = useState<State>({
    detail: null,
    isLoading: Boolean(conversationSlug),
    error: null,
    isLoadingOlder: false,
  });
  const olderInFlight = useRef(false);

  const fetchThread = useCallback(async () => {
    if (!conversationSlug) {
      setState({ detail: null, isLoading: false, error: null, isLoadingOlder: false });
      return;
    }
    // Note: we intentionally do not flip `isLoading: true` here. The
    // previous thread stays visible while the new one loads, which
    // avoids a content flash on background refetches triggered by
    // SSE events. Initial-load loading is set in the initial state.
    try {
      const tz = getViewerTimeZone();
      const detail = await fetchJsonWithAuth<ConversationThreadDto>(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}?as=${perspective}`,
        {
          cache: "no-store",
          headers: { "x-tz": tz },
        },
      );
      setState((prev) => {
        const same = prev.detail?.slug === detail.slug ? prev.detail : null;
        return {
          detail: same
            ? { ...detail, thread: mergeThreadItems(same.thread, detail.thread, tz), olderCursor: same.olderCursor }
            : detail,
          isLoading: false,
          error: null,
          isLoadingOlder: prev.isLoadingOlder,
        };
      });
    } catch (error) {
      setState({
        detail: null,
        isLoading: false,
        error:
          error instanceof ApiClientError
            ? serverMessageOr(error, UI_TEXT.chat.errors.threadLoadFailed)
            : UI_TEXT.chat.errors.offlineRetry,
        isLoadingOlder: false,
      });
    }
  }, [conversationSlug, perspective]);

  useEffect(() => {
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
      await fetchJsonWithAuth<unknown>(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}/read?as=${perspective}`,
        { method: "POST" },
      );
      // NAV-ATTENTION-01: число непрочитанных у вкладки «Сообщения» считает
      // серверный layout кабинета — после прочтения его надо перерисовать.
      startTransition(() => router.refresh());
    } catch {
      // Best-effort — UI re-fetches anyway on next focus.
    }
  }, [conversationSlug, perspective, router]);

  const cursor = state.detail?.olderCursor ?? null;
  const loadOlder = useCallback(async (): Promise<string | null> => {
    if (!conversationSlug || !cursor || olderInFlight.current) return null;
    olderInFlight.current = true;
    setState((prev) => ({ ...prev, isLoadingOlder: true }));
    try {
      const tz = getViewerTimeZone();
      const older = await fetchJsonWithAuth<ConversationThreadDto>(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}?as=${perspective}&before=${encodeURIComponent(cursor)}`,
        { cache: "no-store", headers: { "x-tz": tz } },
      );
      setState((prev) =>
        prev.detail && prev.detail.slug === older.slug
          ? {
              ...prev,
              isLoadingOlder: false,
              detail: {
                ...prev.detail,
                thread: mergeThreadItems(prev.detail.thread, older.thread, tz),
                olderCursor: older.olderCursor,
              },
            }
          : { ...prev, isLoadingOlder: false },
      );
      return null;
    } catch (error) {
      setState((prev) => ({ ...prev, isLoadingOlder: false }));
      return error instanceof ApiClientError
        ? serverMessageOr(error, UI_TEXT.chat.errors.olderLoadFailed)
        : UI_TEXT.chat.errors.offlineRetry;
    } finally {
      olderInFlight.current = false;
    }
  }, [conversationSlug, cursor, perspective]);

  return { ...state, refresh: fetchThread, markRead, loadOlder };
}
