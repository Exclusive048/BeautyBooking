import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientPrimarySegment } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.badges;

const STYLES: Record<StudioClientPrimarySegment, string> = {
  vip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300",
  regular: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  new: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300",
  sleeping: "border-border-subtle bg-bg-input text-text-sec",
  other: "border-border-subtle bg-bg-input text-text-sec",
};

const LABELS: Record<StudioClientPrimarySegment, string> = {
  vip: T.vip,
  regular: T.regular,
  new: T.new,
  sleeping: T.sleeping,
  other: T.other,
};

export function ClientSegmentBadge({ segment }: { segment: StudioClientPrimarySegment }) {
  if (segment === "other") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide",
        STYLES[segment],
      )}
    >
      {LABELS[segment]}
    </span>
  );
}
