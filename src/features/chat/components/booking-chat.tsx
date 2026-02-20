"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { UI_FMT } from "@/lib/ui/fmt";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { NotificationEvent } from "@/lib/notifications/notifier";

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

function toErrorMessage(json: ApiResponse<unknown> | null, fallback: string): string {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
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

  const notifyUnread = useCallback(
    (count: number) => {
      onUnreadCountChange?.(count);
    },
    [onUnreadCountChange]
  );

  const loadChat = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetch(`/api/bookings/${bookingId}/chat`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ApiResponse<ChatResponse> | null;
        if (!res.ok || !json || !json.ok) {
          if (res.status === 403 || res.status === 409) {
            throw new Error("Чат недоступен");
          }
          throw new Error(toErrorMessage(json, `API error: ${res.status}`));
        }
        setMessages(json.data.messages ?? []);
        setIsOpen(Boolean(json.data.isOpen));
        setIsReadOnly(Boolean(json.data.isReadOnly));
        notifyUnread(json.data.unreadCount ?? 0);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить чат");
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
      const res = await fetch(`/api/bookings/${bookingId}/chat/read`, { method: "POST" });
      if (!res.ok) return;
      notifyUnread(0);
    } catch {
      // ignore
    }
  }, [bookingId, notifyUnread]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    if (loading || error) return;
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
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
      senderName: "Вы",
      body: text,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, optimistic]);
    setIsAtBottom(true);

    try {
      const res = await fetch(`/api/bookings/${bookingId}/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ message: ChatMessageDto }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(toErrorMessage(json, `API error: ${res.status}`));
      }
      setMessages((prev) => prev.map((msg) => (msg.id === tempId ? json.data.message : msg)));
    } catch (sendError) {
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setInput(text);
      setError(sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение");
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

  if (error === "Чат недоступен") {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-sm text-text-sec">
        Чат недоступен.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
        <div className="mt-2">
          <Button size="sm" variant="secondary" onClick={() => void loadChat()}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!isOpen && isReadOnly ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec">
          Чат закрыт для отправки (после визита). История доступна 24 часа.
        </div>
      ) : null}
      {!isOpen && !isReadOnly ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3 text-xs text-text-sec">
          Чат закрыт. История доступна.
        </div>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="max-h-64 space-y-3 overflow-auto rounded-2xl border border-border-subtle bg-bg-input/40 p-3"
      >
        {messageGroups.length === 0 ? (
          <div className="text-sm text-text-sec">Сообщений пока нет.</div>
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
                <div className="text-[11px] text-text-sec">{message.senderName}</div>
                <div className="mt-1 whitespace-pre-wrap break-words">{message.body}</div>
                <div className="mt-1 text-[10px] text-text-sec">
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
          placeholder="Напишите сообщение"
          maxLength={1000}
          disabled={!isOpen || sending}
          className="min-h-[90px]"
        />
        <div className="flex items-center justify-between text-xs text-text-sec">
          <span>{input.trim().length}/1000</span>
          <Button size="sm" onClick={() => void sendMessage()} disabled={!canSend || input.trim().length === 0}>
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
