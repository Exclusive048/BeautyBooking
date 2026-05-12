"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuickReplies } from "@/features/chat/composer/quick-replies";
import { UI_TEXT } from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";

const T = UI_TEXT.chat;
const QUICK_HIDE_KEY = "chat.quickReplies.hidden";
const MAX_TEXTAREA_HEIGHT = 120;

type Props = {
  perspective: ChatPerspective;
  conversationSlug: string;
  canSend: boolean;
  disabledHint: string | null;
  onSent: () => void;
};

export function Composer({
  perspective,
  conversationSlug,
  canSend,
  disabledHint,
  onSent,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showQuick, setShowQuick] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-session hide preference for quick replies.
  useEffect(() => {
    try {
      const hidden = window.localStorage.getItem(QUICK_HIDE_KEY) === "1";
      if (hidden) setShowQuick(false);
    } catch {
      // localStorage disabled — fall through.
    }
  }, []);

  // Autosize textarea up to the cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
  }, [draft]);

  // Reset draft when active conversation flips.
  useEffect(() => {
    setDraft("");
    setErrorMessage(null);
  }, [conversationSlug]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending || !canSend) return;
    setSending(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}/messages?as=${perspective}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: unknown }
        | { ok: false; error: { message: string } }
        | null;
      if (!res.ok || !json || !json.ok) {
        const message =
          json && !json.ok ? json.error.message : T.composer.sendFailed;
        setErrorMessage(message);
        return;
      }
      setDraft("");
      onSent();
    } catch {
      setErrorMessage(T.composer.sendFailed);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function hideQuick() {
    setShowQuick(false);
    try {
      window.localStorage.setItem(QUICK_HIDE_KEY, "1");
    } catch {
      // ignored — UI just won't persist
    }
  }

  const placeholder =
    perspective === "client"
      ? T.composer.placeholderClient
      : T.composer.placeholderMaster;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border-subtle bg-bg-card px-4 py-3"
    >
      {showQuick && canSend ? (
        <QuickReplies
          perspective={perspective}
          onPick={(text) => {
            setDraft(text);
            textareaRef.current?.focus();
          }}
          onHide={hideQuick}
        />
      ) : null}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border px-3 py-2 transition",
          canSend
            ? "border-border-subtle bg-bg-input/70 focus-within:border-primary"
            : "border-border-subtle bg-bg-input/40",
        )}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={canSend ? placeholder : (disabledHint ?? T.composer.disabledFallback)}
          disabled={!canSend || sending}
          rows={1}
          maxLength={1000}
          className="min-h-[32px] flex-1 resize-none border-none bg-transparent px-1 py-1.5 text-sm leading-snug text-text-main outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed"
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />
        <button
          type="submit"
          disabled={!canSend || sending || draft.trim().length === 0}
          aria-label={T.composer.send}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
            draft.trim().length > 0 && canSend
              ? "bg-brand-gradient text-white shadow-sm hover:opacity-95"
              : "bg-bg-page text-text-sec/40",
          )}
        >
          <Send className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        </button>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-1.5 text-xs text-rose-600 dark:text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      <p className="mt-1.5 font-mono text-[10.5px] tracking-wide text-text-sec">
        {T.composer.footer}
      </p>
    </form>
  );
}
