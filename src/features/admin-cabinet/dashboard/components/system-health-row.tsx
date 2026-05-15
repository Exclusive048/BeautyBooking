import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminHealthStat,
  AdminHealthTone,
} from "@/features/admin-cabinet/dashboard/types";

const STAT_LABEL: Record<AdminHealthStat["key"], string> = {
  apiUptime: UI_TEXT.adminPanel.dashboard.health.stats.apiUptime,
  p95: UI_TEXT.adminPanel.dashboard.health.stats.p95,
  queuePending: UI_TEXT.adminPanel.dashboard.health.stats.queuePending,
  queueDead: UI_TEXT.adminPanel.dashboard.health.stats.queueDead,
  complaintsOpen: UI_TEXT.adminPanel.dashboard.health.stats.complaintsOpen,
  smsBalance: UI_TEXT.adminPanel.dashboard.health.stats.smsBalance,
};

const DOT: Record<AdminHealthTone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  neutral: "bg-text-sec/40",
};

type Props = {
  stat: AdminHealthStat;
};

export function SystemHealthRow({ stat }: Props) {
  return (
    <li
      className="flex items-center justify-between rounded-xl bg-bg-input/60 px-3 py-2"
      title={stat.hint}
    >
      <span className="flex items-center gap-2 text-sm text-text-main">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[stat.tone])}
        />
        {STAT_LABEL[stat.key]}
      </span>
      <span className="text-sm font-semibold tabular-nums text-text-main">
        {stat.valueText}
      </span>
    </li>
  );
}
