import { AlertCircle, Calendar, Sparkles, Star } from "lucide-react";
import { TaskRow, type TaskUrgency } from "@/features/master/components/dashboard/task-row";
import type { DashboardData } from "@/lib/master/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.attention;

function pluralizeTasks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "задачи";
  return "задач";
}

function formatHm(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

type TaskItem = {
  key: string;
  icon: typeof AlertCircle;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  urgency: TaskUrgency;
};

function buildTasks(data: Pick<DashboardData, "pendingBookings" | "unansweredReviews" | "freeSlot">): TaskItem[] {
  const tasks: TaskItem[] = [];

  for (const pb of data.pendingBookings) {
    const when = pb.startAtUtc ? `${formatHm(pb.startAtUtc)}` : "";
    tasks.push({
      key: `pending-${pb.id}`,
      icon: AlertCircle,
      title: T.confirmBookingTitle,
      description: when
        ? `${pb.clientName}, ${when} — ${pb.serviceTitle}`
        : `${pb.clientName} — ${pb.serviceTitle}`,
      ctaLabel: T.confirmBookingCta,
      ctaHref: `/cabinet/master/bookings/${pb.id}`,
      urgency: "high",
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
      ctaLabel: T.unansweredReviewCta,
      ctaHref: `/cabinet/master/reviews`,
      urgency: "medium",
    });
  }

  if (data.freeSlot) {
    const fromIso = data.freeSlot.startAtUtc.toISOString();
    tasks.push({
      key: "free-slot",
      icon: Calendar,
      title: T.freeSlotTitle
        .replace("{from}", formatHm(data.freeSlot.startAtUtc))
        .replace("{to}", formatHm(data.freeSlot.endAtUtc)),
      description: T.freeSlotDescription.replace(
        "{minutes}",
        String(data.freeSlot.durationMin),
      ),
      ctaLabel: T.freeSlotCta,
      ctaHref: `/cabinet/master/schedule?from=${encodeURIComponent(fromIso)}`,
      urgency: "medium",
    });
  }

  return tasks.slice(0, 4);
}

type Props = {
  pendingBookings: DashboardData["pendingBookings"];
  unansweredReviews: DashboardData["unansweredReviews"];
  freeSlot: DashboardData["freeSlot"];
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
}: Props) {
  const tasks = buildTasks({ pendingBookings, unansweredReviews, freeSlot });
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
              ctaLabel={task.ctaLabel}
              ctaHref={task.ctaHref}
              urgency={task.urgency}
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
