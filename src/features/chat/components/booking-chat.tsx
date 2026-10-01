"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { scrollBehavior } from "@/lib/ui/scroll";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { NotificationEvent } from "@/lib/notifications/types";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

type ChatMessageDto = {
  id: string;
  senderType: "CLIENT" | "MASTER";
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type ChatResponse = {
  chatId: string;
  isOpen: boolean;
  isReadOnly?: boolean;
  messages: ChatMessageDto[];
  unreadCount: number;
};

type ChatPayload = {
  bookingId?: unknown;
};

type Props = {
  bookingId: string;
  currentRole: "CLIENT" | "MASTER";
  onUnreadCountChange?: (count: number) => void;
};

function parseChatPayload(payload: unknown): { bookingId: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as ChatPayload;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  return { bookingId: record.bookingId };
}

export function BookingChat({ bookingId, currentRole, onUnreadCountChange }: Props) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const onUnreadCountChangeRef = useRef<Props["onUnreadCountChange"]>(onUnreadCountChange);
  const hasMarkedInitialReadRef = useRef(false);

  useEffect(() => {
    onUnreadCountChangeRef.current = onUnreadCountChange;
  }, [onUnreadCountChange]);

  const notifyUnread = useCallback((count: number) => {
    onUnreadCountChangeRef.current?.(count);
  }, []);

  const loadChat = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await fetchJsonWithAuth<ChatResponse>(`/api/bookings/${bookingId}/chat`, {
          cache: "no-store",
        });
        setMessages(data.messages ?? []);
        setIsOpen(Boolean(data.isOpen));
        setIsReadOnly(Boolean(data.isReadOnly));
        notifyUnread(data.unreadCount ?? 0);
      } catch (loadError) {
        // Нет доступа / чат закрыт — своя строка поверхности «Чат недоступен».
        const unavailable =
          loadError instanceof ApiClientError && (loadError.status === 403 || loadError.status === 409);
        setError(unavailable ? UI_TEXT.chat.errors.unavailable : serverMessageOr(loadError, UI_TEXT.chat.errors.loadFailed));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [bookingId, notifyUnread]
  );

  const markRead = useCallback(async () => {
    try {
      await fetchJsonWithAuth<unknown>(`/api/bookings/${bookingId}/chat/read`, { method: "POST" });
      notifyUnread(0);
    } catch {
      // Фон: пометка «прочитано»; счётчик поправится со следующим чтением.
    }
  }, [bookingId, notifyUnread]);

  useEffect(() => {
    hasMarkedInitialReadRef.current = false;
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (loading || error || hasMarkedInitialReadRef.current) return;
    hasMarkedInitialReadRef.current = true;
    void markRead();
  }, [error, loading, markRead]);

  useEffect(() => {
    return subscribeNotificationEvent((event) => {
      if (event.kind !== "incoming" || !event.notification) return;
      const notification = event.notification as NotificationEvent;
      if (notification.type !== "CHAT_MESSAGE_RECEIVED") return;
      const payload = parseChatPayload(notification.payloadJson);
      if (!payload || payload.bookingId !== bookingId) return;
      void loadChat(true);
      void markRead();
    });
  }, [bookingId, loadChat, markRead]);

  useEffect(() => {
    if (!isAtBottom) return;
    endRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
  }, [isAtBottom, messages.length]);

  const handleScroll = () => {
    const container = listRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsAtBottom(distance < 48);
  };

  const canSend = isOpen && !sending;

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessageDto = {
      id: tempId,
      senderType: currentRole,
      senderName: UI_TEXT.chat.labels.you,
      body: text,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, optimistic]);
    setIsAtBottom(true);

    try {
      const sent = await fetchJsonWithAuth<{ message: ChatMessageDto }>(`/api/bookings/${bookingId}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      setMessages((prev) => prev.map((msg) => (msg.id === tempId ? sent.message : msg)));
    } catch (sendError) {
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setInput(text);
      setError(serverMessageOr(sendError, UI_TEXT.chat.errors.sendFailed));
    } finally {
      setSending(false);
    }
  }, [bookingId, currentRole, input, sending]);

  const messageGroups = useMemo(() => messages, [messages]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error === UI_TEXT.chat.errors.unavailable) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
        {UI_TEXT.chat.errors.unavailable}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text">
        {error}
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={() => void loadChat()}>
            {UI_TEXT.chat.actions.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!isOpen && isReadOnly ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec">
          {UI_TEXT.chat.states.closedAfterVisit}
        </div>
      ) : null}
      {!isOpen && !isReadOnly ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec">
          {UI_TEXT.chat.states.closed}
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="max-h-64 space-y-3 overflow-auto rounded-2xl border border-border-subtle bg-bg-input/40 p-3"
      >
        {messageGroups.length === 0 ? (
          <div className="text-sm text-text-sec">{UI_TEXT.chat.states.empty}</div>
        ) : null}
        {messageGroups.map((message) => {
          const isMine = message.senderType === currentRole;
          return (
            <div
              key={message.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-card ${
                  isMine ? "bg-primary/15 text-text-main" : "bg-bg-card text-text-main"
                }`}
              >
                <div className="text-2xs text-text-sec">{message.senderName}</div>
                <div className="mt-1 whitespace-pre-wrap break-words">{message.body}</div>
                <div className="mt-1 text-3xs text-text-sec">
                  {UI_FMT.timeShort(message.createdAt, { timeZone: viewerTimeZone })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={UI_TEXT.chat.placeholder}
          maxLength={1000}
          disabled={!isOpen || sending}
          className="min-h-[90px]"
        />
        <div className="flex items-center justify-between text-xs text-text-sec">
          <span>{input.trim().length}/1000</span>
          <Button size="sm" onClick={() => void sendMessage()} disabled={!canSend || input.trim().length === 0}>
            {UI_TEXT.chat.actions.send}
          </Button>
        </div>
      </div>
    </div>
  );
}
