import { Badge } from "@/components/ui/badge";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioClientPrimarySegment } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.badges;

// 29.09 доработки · 25: цвет плашки — вариант `Badge` (спека 23).
const VARIANTS: Record<Exclude<StudioClientPrimarySegment, "other">, "warning" | "success" | "info" | "muted"> = {
  vip: "warning",
  regular: "success",
  new: "info",
  sleeping: "muted",
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
    <Badge size="xs" variant={VARIANTS[segment]} className="shrink-0">
      {LABELS[segment]}
    </Badge>
  );
}
