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
  return (
    <div className={cn("max-w-[520px]", isMine ? "self-end" : "self-start")}>
      <div
        className={cn(
          "px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words",
          isMine
            ? "bg-brand-gradient text-white shadow-sm"
            : "bg-bg-card text-text-main border border-border-subtle",
          isMine ? "rounded-[16px_16px_4px_16px]" : "rounded-[16px_16px_16px_4px]",
        )}
      >
        {message.body}
      </div>
      <BubbleMeta
        time={formatTimeHm(new Date(message.createdAt), viewerTimezone)}
        isMine={isMine}
        isRead={Boolean(message.readAt)}
      />
    </div>
  );
}
