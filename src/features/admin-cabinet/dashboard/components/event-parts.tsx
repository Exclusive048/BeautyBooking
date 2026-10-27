"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { UI_FMT, VIEWER_TZ, type DatePreset } from "@/lib/ui/fmt";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import * as UI_TEXT from "@/lib/ui/text";
import { ADMIN_EVENTS_POLL_MS } from "@/features/admin-cabinet/dashboard/lib/use-admin-events-poll";
import type {
  AdminEventAmountTone,
  AdminEventDotTone,
  AdminEventPerson,
} from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.feed;

const DOT_CLASS: Record<AdminEventDotTone, string> = {
  ok: "bg-success",
  new: "bg-primary",
  sub: "bg-warning",
  cancel: "bg-destructive",
  alert: "bg-destructive",
};

export const AMOUNT_CLASS: Record<AdminEventAmountTone, string> = {
  neutral: "text-text-main",
  positive: "text-success-text",
  negative: "text-danger-text",
};

export function EventDot({ tone }: { tone: AdminEventDotTone }) {
  return <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />;
}

/** Время события в поясе зрителя (viewer-tz): часы зрителя — только после
 *  гидратации, иначе сервер посчитал бы их в поясе контейнера. */
export function EventTime({
  timeIso,
  timeMs,
  preset = "dayMonthShortTime",
  className,
}: {
  timeIso: string;
  timeMs: number;
  preset?: DatePreset;
  className?: string;
}) {
  const hydrated = useIsHydrated();
  return (
    <time dateTime={timeIso} className={cn("font-mono text-2xs tabular-nums text-text-sec", className)}>
      {hydrated ? UI_FMT.date(timeMs, preset, { timeZone: VIEWER_TZ }) : null}
    </time>
  );
}

/** Человек события: имя ссылкой на карточку в «Пользователях» и роль. */
export function EventPerson({ person, compact = false }: { person: AdminEventPerson; compact?: boolean }) {
  const name = person.href ? (
    <Link
      href={person.href}
      className="font-medium text-text-main underline-offset-2 hover:text-accent-text hover:underline"
    >
      {person.name}
    </Link>
  ) : (
    <span className="font-medium text-text-main">{person.name}</span>
  );
  return (
    <span className="min-w-0 break-words">
      {name}
      {person.role && !compact ? <span className="text-text-sec"> · {person.role}</span> : null}
    </span>
  );
}

export function LiveBadge() {
  return (
    <span className="eyebrow inline-flex items-center gap-1.5">
      <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
      {T.liveBadge(ADMIN_EVENTS_POLL_MS / 1000)}
    </span>
  );
}
