import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  time: string;
  isMine: boolean;
  isRead: boolean;
};

/**
 * Time + read receipt under each message bubble (33a).
 * Burgundy double-check when read, single muted check otherwise.
 */
export function BubbleMeta({ time, isMine, isRead }: Props) {
  return (
    <div
      className={cn(
        "mt-0.5 flex items-center gap-1 px-1 font-mono text-[10.5px] text-text-sec",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      <span>{time}</span>
      {isMine ? (
        isRead ? (
          <CheckCheck className="h-3 w-3 text-primary" aria-hidden strokeWidth={2} />
        ) : (
          <Check className="h-3 w-3 text-text-sec" aria-hidden strokeWidth={2} />
        )
      ) : null}
    </div>
  );
}
