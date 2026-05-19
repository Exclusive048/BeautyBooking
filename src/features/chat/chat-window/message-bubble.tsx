import { cn } from "@/lib/cn";
import { BubbleMeta } from "@/features/chat/chat-window/bubble-meta";
import { formatTimeHm } from "@/features/chat/lib/format-time";
import type { ThreadMessageDto } from "@/features/chat/types";

type Props = {
  message: ThreadMessageDto;
  isMine: boolean;
  viewerTimezone: string;
};

export function MessageBubble({ message, isMine, viewerTimezone }: Props) {
  const hasBody = message.body.trim().length > 0;
  const hasAttachment = Boolean(message.attachmentMediaAssetId);
  return (
    <div className={cn("max-w-[520px]", isMine ? "self-end" : "self-start")}>
      {hasAttachment ? (
        <a
          href={`/api/media/file/${message.attachmentMediaAssetId}`}
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
          {/* Plain <img> intentional — the media-delivery route streams
              bytes with the right content-type; next/image would
              require a full asset URL and we'd lose the same-origin
              cookie-auth needed for media access. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media/file/${message.attachmentMediaAssetId}`}
            alt=""
            loading="lazy"
            className="block max-h-[320px] w-full object-cover"
          />
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
