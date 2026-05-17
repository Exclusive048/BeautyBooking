import { Bell, Calendar, CheckCircle2, Smartphone } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioNotificationsKpi } from "../lib/types";

const T = UI_TEXT.studioCabinet.notificationsV2.kpis;

type Props = {
  kpi: StudioNotificationsKpi;
};

export function NotificationsKpiRow({ kpi }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        icon={<Bell className="h-4 w-4" aria-hidden />}
        label={T.unread}
        value={String(kpi.unreadCount)}
        sub={T.unreadTemplate
          .replace("{count}", String(kpi.unreadCount))
          .replace("{total}", String(kpi.totalCount))}
        accent={kpi.unreadCount > 0}
      />
      <Tile
        icon={<Calendar className="h-4 w-4" aria-hidden />}
        label={T.today}
        value={String(kpi.todayCount)}
        sub={T.todayTemplate.replace("{count}", String(kpi.todayCount))}
      />
      <Tile
        icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
        label={T.needsDecision}
        value={String(kpi.needsDecisionCount)}
        sub={T.needsDecisionTemplate.replace("{count}", String(kpi.needsDecisionCount))}
        accent={kpi.needsDecisionCount > 0}
      />
      <Tile
        icon={<Smartphone className="h-4 w-4" aria-hidden />}
        label={T.push}
        value={kpi.pushEnabled ? T.pushEnabled : T.pushDisabled}
        sub={T.pushHint}
        narrow
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  accent,
  narrow,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  /** Push tile uses a label as the value — render at body font-size, not display. */
  narrow?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="flex items-center gap-2 text-text-sec">
        <span
          className={
            accent
              ? "grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"
              : "grid h-7 w-7 place-items-center rounded-lg bg-bg-input text-text-sec"
          }
        >
          {icon}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div
        className={
          narrow
            ? "mt-2 font-display text-base font-semibold text-text-main"
            : "mt-2 font-display text-2xl font-bold tabular-nums text-text-main"
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-text-sec">{sub}</div>
    </div>
  );
}
