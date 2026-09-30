import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioAttentionItem } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.attention;

type ItemMeta = {
  icon: LucideIcon;
  titleTemplate: string;
  action: string;
  /** Tailwind ring class for the icon container. */
  tone: string;
};

const META: Record<StudioAttentionItem["id"], ItemMeta> = {
  "pending-master-approvals": {
    icon: UserPlus,
    titleTemplate: T.items.pendingMastersTitle,
    action: T.items.pendingMastersAction,
    tone: "bg-success-surface text-success-text",
  },
  "bookings-awaiting": {
    icon: CalendarCheck,
    titleTemplate: T.items.bookingsAwaitingTitle,
    action: T.items.bookingsAwaitingAction,
    tone: "bg-warning-surface text-warning-text",
  },
  "reviews-unanswered": {
    icon: Star,
    titleTemplate: T.items.reviewsUnansweredTitle,
    action: T.items.reviewsUnansweredAction,
    tone: "bg-primary/10 text-accent-text",
  },
  "schedule-requests": {
    icon: CalendarClock,
    titleTemplate: T.items.scheduleRequestsTitle,
    action: T.items.scheduleRequestsAction,
    tone: "bg-info-surface text-info-text",
  },
};

type Props = {
  items: StudioAttentionItem[];
  total: number;
  urgent: number;
};

export function StudioAttentionPanel({ items, total, urgent }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight text-text-main">
            {T.title}
          </h3>
          <p className="mt-0.5 text-xs text-text-sec">
            {total === 0
              ? T.empty
              : T.subtitleTemplate
                  .replace("{count}", String(total))
                  .replace("{urgent}", String(urgent))}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success-text" aria-hidden />
          <p className="text-sm text-text-sec">{T.emptyBody}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const meta = META[item.id];
            const Icon = meta.icon;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl bg-bg-input/40 px-3 py-2.5"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text-main">
                    {meta.titleTemplate.replace("{count}", String(item.count))}
                  </div>
                  {item.urgent ? (
                    <div className="mt-0.5 text-[11px] font-mono uppercase tracking-wide text-accent-text">
                      {T.urgentLabel}
                    </div>
                  ) : null}
                </div>
                <Link
                  href={item.href}
                  className="rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:bg-bg-input"
                >
                  {meta.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
