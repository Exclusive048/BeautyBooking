"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Paperclip, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuickReplies } from "@/features/chat/composer/quick-replies";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { ChatPerspective } from "@/features/chat/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileInput } from "@/components/ui/file-input";

const T = UI_TEXT.chat;
const QUICK_HIDE_KEY = "chat.quickReplies.hidden";
const MAX_TEXTAREA_HEIGHT = 120;
const ALLOWED_ATTACHMENT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type Props = {
  perspective: ChatPerspective;
  conversationSlug: string;
  canSend: boolean;
  disabledHint: string | null;
  onSent: () => void;
};

type AttachmentState =
  | { phase: "idle" }
  | { phase: "uploading"; previewUrl: string }
  | { phase: "ready"; previewUrl: string; assetId: string }
  | { phase: "error"; message: string };

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
  const [attachment, setAttachment] = useState<AttachmentState>({ phase: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Reset draft + attachment when active conversation flips.
  useEffect(() => {
    setDraft("");
    setErrorMessage(null);
    setAttachment((current) => {
      if (current.phase === "uploading" || current.phase === "ready") {
        URL.revokeObjectURL(current.previewUrl);
      }
      return { phase: "idle" };
    });
  }, [conversationSlug]);

  // Cleanup any object URL on unmount.
  useEffect(() => {
    return () => {
      setAttachment((current) => {
        if (current.phase === "uploading" || current.phase === "ready") {
          URL.revokeObjectURL(current.previewUrl);
        }
        return current;
      });
    };
  }, []);

  async function handleAttachmentPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reset native input so picking the same file again re-fires onChange.
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_ATTACHMENT_MIME.has(file.type)) {
      setAttachment({ phase: "error", message: T.composer.attachInvalidType });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment({ phase: "error", message: T.composer.attachTooLarge });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setAttachment({ phase: "uploading", previewUrl });

    const formData = new FormData();
    formData.append("image", file);
    try {
      const uploaded = await fetchJsonWithAuth<{ assetId: string }>("/api/chat/upload-attachment", {
        method: "POST",
        body: formData,
      });
      setAttachment({ phase: "ready", previewUrl, assetId: uploaded.assetId });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setAttachment({ phase: "error", message: serverMessageOr(error, T.composer.attachUploadFailed) });
    }
  }

  function handleAttachmentRemove() {
    setAttachment((current) => {
      if (current.phase === "uploading" || current.phase === "ready") {
        URL.revokeObjectURL(current.previewUrl);
      }
      return { phase: "idle" };
    });
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    const readyAssetId =
      attachment.phase === "ready" ? attachment.assetId : null;
    // Either text or a ready attachment is required. While the asset
    // is uploading the submit button is disabled (see below).
    if ((!trimmed && !readyAssetId) || sending || !canSend) return;
    setSending(true);
    setErrorMessage(null);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/chat/threads/${encodeURIComponent(conversationSlug)}/messages?as=${perspective}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: trimmed,
            attachmentMediaAssetId: readyAssetId,
          }),
        },
      );
      setDraft("");
      if (attachment.phase === "ready" || attachment.phase === "uploading") {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setAttachment({ phase: "idle" });
      onSent();
    } catch (error) {
      setErrorMessage(serverMessageOr(error, T.composer.sendFailed));
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

  const attachmentPreviewUrl =
    attachment.phase === "uploading" || attachment.phase === "ready"
      ? attachment.previewUrl
      : null;
  const isAttachmentUploading = attachment.phase === "uploading";
  const hasReadyAttachment = attachment.phase === "ready";
  const canSubmit =
    canSend &&
    !sending &&
    !isAttachmentUploading &&
    (draft.trim().length > 0 || hasReadyAttachment);

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

      {attachmentPreviewUrl ? (
        <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-border-subtle bg-bg-input/60 px-2 py-1.5">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachmentPreviewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {isAttachmentUploading ? (
              <div className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] font-medium text-white">
                …
              </div>
            ) : null}
          </div>
          <span className="text-xs text-text-sec">
            {isAttachmentUploading ? T.composer.attachUploading : "Фото"}
          </span>
          <Button variant="wrapper"
            onClick={handleAttachmentRemove}
            aria-label={T.composer.attachRemoveAria}
            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-sec hover:text-text-main"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border px-3 py-2 transition",
          canSend
            ? "border-border-subtle bg-bg-input/70 focus-within:border-primary"
            : "border-border-subtle bg-bg-input/40",
        )}
      >
        <Button variant="ghost" size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canSend || sending || isAttachmentUploading}
          aria-label={T.composer.attachAria}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-sec transition hover:bg-bg-page hover:text-text-main",
            (!canSend || isAttachmentUploading) && "cursor-not-allowed opacity-50",
          )}
        >
          <Paperclip className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        </Button>
        <FileInput
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAttachmentPick}
        />
        <Textarea variant="bare"
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={T.composer.inputLabel}
          placeholder={canSend ? placeholder : (disabledHint ?? T.composer.disabledFallback)}
          disabled={!canSend || sending}
          rows={1}
          maxLength={1000}
          className="min-h-[32px] flex-1 resize-none border-none bg-transparent px-1 py-1.5 text-sm leading-snug text-text-main outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed"
          style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
        />
        <Button variant="wrapper"
          type="submit"
          disabled={!canSubmit}
          aria-label={T.composer.send}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
            canSubmit
              ? "bg-brand-gradient text-white shadow-sm hover:opacity-95"
              : "bg-bg-page text-text-sec/40",
          )}
        >
          <Send className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        </Button>
      </div>

      {errorMessage ? (
        <p role="alert" className="mt-1.5 text-xs text-danger-text">
          {errorMessage}
        </p>
      ) : null}
      {attachment.phase === "error" ? (
        <p role="alert" className="mt-1.5 text-xs text-danger-text">
          {attachment.message}
        </p>
      ) : null}

      <p className="mt-1.5 font-mono text-[10.5px] tracking-wide text-text-sec">
        {T.composer.footer}
      </p>
    </form>
  );
}
