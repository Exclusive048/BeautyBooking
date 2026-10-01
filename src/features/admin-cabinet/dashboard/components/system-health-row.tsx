import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import type {
  AdminHealthStat,
  AdminHealthTone,
} from "@/features/admin-cabinet/dashboard/types";

const STAT_LABEL: Record<AdminHealthStat["key"], string> = UI_TEXT.adminPanel.dashboard.health.stats;

const DOT: Record<AdminHealthTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
  neutral: "bg-text-sec/40",
};

type Props = {
  stat: AdminHealthStat;
};

export function SystemHealthRow({ stat }: Props) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-xl bg-bg-input/60 px-3 py-2"
      title={stat.hint}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-text-main">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[stat.tone])}
        />
        {STAT_LABEL[stat.key]}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums text-text-main">
        {stat.valueText}
      </span>
    </li>
  );
}
