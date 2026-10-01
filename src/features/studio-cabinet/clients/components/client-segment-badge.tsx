import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientPrimarySegment } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.badges;

const STYLES: Record<StudioClientPrimarySegment, string> = {
  vip: "border-warning-border bg-warning-surface text-warning-text",
  regular: "border-success-border bg-success-surface text-success-text",
  new: "border-info-border bg-info-surface text-info-text",
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
        "inline-flex shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-3xs uppercase tracking-wide",
        STYLES[segment],
      )}
    >
      {LABELS[segment]}
    </span>
  );
}
