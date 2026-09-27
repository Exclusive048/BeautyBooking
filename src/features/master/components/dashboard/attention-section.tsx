import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, Calendar, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmBookingAction } from "@/features/master/components/dashboard/confirm-booking-action";
import { TaskRow, type TaskUrgency } from "@/features/master/components/dashboard/task-row";
import { workContextLabel } from "@/features/master/components/work-context-badge";
import type { DashboardData } from "@/lib/master/dashboard.service";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.attention;

function pluralizeTasks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "задачи";
  return "задач";
}

type TaskItem = {
  key: string;
  icon: typeof AlertCircle;
  title: string;
  description: string;
  cta: ReactNode;
  urgency: TaskUrgency;
  /** FIX-R2-06-B: deep-link focus anchor (pending booking id) for `?focus=`. */
  focusId?: string;
};

function buildTasks(
  data: Pick<DashboardData, "pendingBookings" | "unansweredReviews" | "freeSlot">,
  timezone: string,
  showWorkContext: boolean,
): TaskItem[] {
  const tasks: TaskItem[] = [];

  for (const pb of data.pendingBookings) {
    const when = pb.startAtUtc ? formatLocalHm(pb.startAtUtc, timezone) : "";
    // RESCHEDULE-CURRENT-TIME: у запроса переноса АКТУАЛЬНОЕ время — то, что
    // просит клиент; прежнее показывается рядом, иначе мастер читал первую
    // дату как текущую (клиент записался и тут же перенёс).
    const proposed = pb.proposedStartAt ? formatLocalHm(pb.proposedStartAt, timezone) : "";
    const whenText = proposed && when ? `${when} → ${proposed}` : proposed || when;
    tasks.push({
      key: `pending-${pb.id}`,
      icon: AlertCircle,
      title: pb.isRescheduleRequest ? T.rescheduleRequestTitle : T.confirmBookingTitle,
      description:
        (whenText
          ? `${pb.clientName}, ${whenText} — ${pb.serviceTitle}`
          : `${pb.clientName} — ${pb.serviceTitle}`) +
        // STUDIO-MASTER-PROFILES (этап 3): чья это запись — личная или студии.
        (showWorkContext ? ` · ${workContextLabel(pb.workContext)}` : ""),
      // fix-02: replace the broken `/bookings/[id]` link with an inline
      // confirm action — same PATCH endpoint the kanban uses, no
      // navigation away from the dashboard.
      cta: <ConfirmBookingAction bookingId={pb.id} />,
      urgency: "high",
      focusId: pb.id,
    });
  }

  for (const r of data.unansweredReviews) {
    const teaser = r.text ? `«${r.text.slice(0, 60)}${r.text.length > 60 ? "…" : ""}»` : "";
    tasks.push({
      key: `review-${r.id}`,
      icon: Star,
      title: T.unansweredReviewTitle,
      description: teaser
        ? `${r.authorName} · ${r.rating}★ — ${teaser}`
        : `${r.authorName} · ${r.rating}★`,
      cta: (
        <Button asChild variant="secondary" size="sm">
          <Link href="/cabinet/master/reviews">{T.unansweredReviewCta}</Link>
        </Button>
      ),
      urgency: "medium",
    });
  }

  if (data.freeSlot) {
    tasks.push({
      key: "free-slot",
      icon: Calendar,
      title: T.freeSlotTitle
        .replace("{from}", formatLocalHm(data.freeSlot.startAtUtc, timezone))
        .replace("{to}", formatLocalHm(data.freeSlot.endAtUtc, timezone)),
      // FIX-FREE-HOURS: карточка сообщает часы, округлённые ВНИЗ. Окошко
      // отбирается по порогу >= 60 мин, поэтому `Math.max(1, …)` — страховка
      // от будущего снижения порога, а не рабочая ветка.
      description: T.freeSlotDescription(
        Math.max(1, Math.floor(data.freeSlot.durationMin / 60)),
      ),
      // fix-02: there's no "launch a single hot slot from a free
      // window" flow — hot slots auto-publish via DiscountRule. Link
      // to the rules tab so the master can configure it instead.
      cta: (
        <Button asChild variant="secondary" size="sm">
          <Link href="/cabinet/master/schedule/settings?tab=rules">
            {T.freeSlotCta}
          </Link>
        </Button>
      ),
      urgency: "medium",
    });
  }

  return tasks.slice(0, 4);
}

type Props = {
  pendingBookings: DashboardData["pendingBookings"];
  unansweredReviews: DashboardData["unansweredReviews"];
  freeSlot: DashboardData["freeSlot"];
  /** Salon (master) tz — EXP-017: booking/slot times shown in salon-tz, matching the kanban. */
  timezone: string;
  /** STUDIO-MASTER-PROFILES (этап 3): подписывать ли у запроса «личная / студия». */
  showWorkContext?: boolean;
};

/**
 * "Требуют внимания" panel — pulls real signals from the dashboard data
 * (pending bookings, unanswered reviews, free-slot opportunity) and lists
 * up to 4 tasks. Empty state celebrates a clean inbox.
 */
export function AttentionSection({
  pendingBookings,
  unansweredReviews,
  freeSlot,
  timezone,
  showWorkContext = false,
}: Props) {
  const tasks = buildTasks({ pendingBookings, unansweredReviews, freeSlot }, timezone, showWorkContext);
  const hasTasks = tasks.length > 0;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card">
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          {hasTasks ? (
            <p className="mt-0.5 text-xs text-text-sec">
              {T.subtitleTemplate
                .replace("{count}", String(tasks.length))
                .replace("{plural}", pluralizeTasks(tasks.length))}
            </p>
          ) : null}
        </div>
        {hasTasks ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
            {T.sortLabel}
          </span>
        ) : null}
      </header>

      {hasTasks ? (
        <div className="divide-y divide-border-subtle">
          {tasks.map((task) => (
            <TaskRow
              key={task.key}
              icon={task.icon}
              title={task.title}
              description={task.description}
              cta={task.cta}
              urgency={task.urgency}
              focusId={task.focusId}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-8 pt-4 text-center">
          <Sparkles
            aria-hidden
            className="mx-auto mb-3 h-12 w-12 text-text-sec/50"
          />
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-text-sec">
            {T.emptyDescription}
          </p>
        </div>
      )}
    </section>
  );
}
