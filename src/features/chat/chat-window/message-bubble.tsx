"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { BubbleMeta } from "@/features/chat/chat-window/bubble-meta";
import { formatTimeHm } from "@/features/chat/lib/format-time";
import type { ThreadMessageDto } from "@/features/chat/types";

type Props = {
  message: ThreadMessageDto;
  isMine: boolean;
  viewerTimezone: string;
};

function AttachmentImage({
  url,
  className,
}: {
  url: string;
  className: string;
}) {
  // MASTER-CHAT-ATTACHMENT-FIX-A:
  //   - Track load + error so the bubble never collapses to the
  //     `<img>`-broken-icon-as-thin-strip state (this was the «полоска»
  //     bug — before the ACL fix the route returned 403, and the
  //     `w-full max-h-[320px]` img with no min-height shrank to the
  //     ~24px alt-text strip).
  //   - On error: explicit fallback tile (icon + label) with the same
  //     framed dimensions — the user sees "не удалось загрузить" instead
  //     of a confusing strip.
  //   - On load: skeleton placeholder (bg-bg-input/40 at min-height
  //     200px) keeps layout stable while bytes stream.
  //   - `aspect-[4/3]` + `min-h-[200px]` reserves vertical space so even
  //     stale tokens or transient network errors don't degrade to a
  //     thin strip.
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={cn(
          className,
          "flex aspect-[4/3] min-h-[200px] w-full flex-col items-center justify-center gap-2 bg-bg-input/40 text-text-sec",
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-xs">Не удалось загрузить вложение</span>
      </div>
    );
  }

  return (
    <div className={cn(className, "relative aspect-[4/3] min-h-[200px] w-full bg-bg-input/40")}>
      {/* Plain <img> intentional — the chat-attachment delivery route
          streams bytes via cookie-auth + token. next/image would
          rewrite the URL through the optimisation pipeline and lose
          our token. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        className={cn(
          "absolute inset-0 block h-full w-full object-cover transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
    </div>
  );
}

export function MessageBubble({ message, isMine, viewerTimezone }: Props) {
  const hasBody = message.body.trim().length > 0;
  const attachmentUrl = message.attachmentUrl;
  const hasAttachment = Boolean(attachmentUrl);
  return (
    <div className={cn("max-w-[520px]", isMine ? "self-end" : "self-start")}>
      {hasAttachment && attachmentUrl ? (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "block overflow-hidden",
            hasBody ? "rounded-t-[16px]" : "rounded-[16px]",
            isMine ? "rounded-bl-[16px]" : "rounded-br-[16px]",
            isMine && !hasBody ? "rounded-br-[4px]" : "",
            !isMine && !hasBody ? "rounded-bl-[4px]" : "",
            "border border-border-subtle bg-bg-input/40",
          )}
        >
          <AttachmentImage url={attachmentUrl} className="" />
        </a>
      ) : null}
      {hasBody ? (
        <div
          className={cn(
            "px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words",
            isMine
              ? "bg-brand-gradient text-white shadow-sm"
              : "bg-bg-card text-text-main border border-border-subtle",
            // Adjust corners when attachment is on top: the bubble's
            // top corners go flush with the image; bottom corners
            // keep the speech-bubble tail.
            hasAttachment
              ? isMine
                ? "rounded-b-[16px] rounded-tl-[16px] rounded-tr-[4px]"
                : "rounded-b-[16px] rounded-tr-[16px] rounded-tl-[4px]"
              : isMine
              ? "rounded-[16px_16px_4px_16px]"
              : "rounded-[16px_16px_16px_4px]",
          )}
        >
          {message.body}
        </div>
      ) : null}
      <BubbleMeta
        time={formatTimeHm(new Date(message.createdAt), viewerTimezone)}
        isMine={isMine}
        isRead={Boolean(message.readAt)}
      />
    </div>
  );
}
