import { formatDaySeparator } from "@/features/chat/lib/format-time";

type Props = {
  dateKey: string;
  viewerTimezone: string;
};

export function DaySeparator({ dateKey, viewerTimezone }: Props) {
  return (
    <div className="my-2 flex items-center gap-3 self-stretch text-[11px] text-text-sec">
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
      <span className="font-mono uppercase tracking-wider">
        {formatDaySeparator(dateKey, viewerTimezone)}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}
