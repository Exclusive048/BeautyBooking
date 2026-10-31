import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import {
  JOURNAL_STATUS_TONE,
  isJournalStatusInactive,
  type JournalStatusKey,
} from "@/features/bookings-journal/lib/journal-status";
import { BookingCardActions } from "@/features/master/components/bookings/booking-card-actions";
import { BookingManageActions } from "@/features/master/components/bookings/booking-manage-actions";
import { BookingNoShowAction } from "@/features/master/components/bookings/booking-no-show-action";
import { WorkContextBadge } from "@/features/master/components/work-context-badge";
import { cn } from "@/lib/cn";
import type { MasterBookingItem } from "@/lib/master/booking-items.service";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";

const T = UI_TEXT.cabinetMaster.bookings.card;
const J = UI_TEXT.schedule.bookingsJournal;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

function hm(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : formatLocalHm(date, timeZone);
}

/**
 * BOOKINGS-JOURNAL — запись в журнале мастера. Время — пояс салона записи
 * (salon-tz, `item.timezone`): у записи в студии другого пояса рядом стоит
 * метка зоны. Действия — те же острова, что были у карточек канбана, и
 * показываются по правилу `master-actions.ts` (`item.actions`): ответ на
 * новую запись и перенос, перенос / отмена подтверждённой, неявка.
 * Телефона в строке нет (RKN-FIX-10) — он в карточке клиента.
 */
export function MasterJournalRow({
  item,
  statusKey,
  cabinetTimeZone,
  showWorkContext,
}: {
  item: MasterBookingItem;
  statusKey: JournalStatusKey;
  /** Пояс кабинета мастера — по нему сгруппированы дни журнала. */
  cabinetTimeZone: string;
  showWorkContext: boolean;
}) {
  const inactive = isJournalStatusInactive(statusKey);
  const services = item.services.map((line) => line.title).join(", ") || item.serviceTitle;
  const zoneNote =
    item.timezone !== cabinetTimeZone && item.startAtUtc
      ? formatZoneLabel({ iso: item.startAtUtc, timeZone: item.timezone })
      : null;
  const proposed =
    item.proposedStartAtUtc && statusKey === "CHANGE_REQUESTED"
      ? UI_FMT.date(item.proposedStartAtUtc, "dayMonthShortTime", { timeZone: item.timezone })
      : null;
  const awaitingAnswer = item.runtimeStatus === "PENDING" || item.runtimeStatus === "CHANGE_REQUESTED";
  const manageable = item.runtimeStatus === "CONFIRMED" && item.startAtUtc !== null;

  return (
    <li
      data-testid="booking-row"
      data-focus-id={item.id}
      className={cn(
        "grid grid-cols-[3.75rem_minmax(0,1fr)_auto] gap-x-3 px-3 py-3 transition-colors hover:bg-bg-input/30 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:px-4",
        inactive && "text-text-sec",
      )}
    >
      <div className="pt-0.5">
        <p
          className={cn(
            "font-display text-base font-semibold tabular-nums",
            inactive ? "text-text-sec line-through" : "text-text-main",
          )}
        >
          {hm(item.startAtUtc, item.timezone)}
        </p>
        <p className="text-2xs tabular-nums text-text-sec">{hm(item.endAtUtc, item.timezone)}</p>
        {zoneNote ? <p className="text-3xs text-text-sec">{zoneNote}</p> : null}
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {item.clientAvatarUrl ? (
            <ResilientImage
              src={item.clientAvatarUrl}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec ring-1 ring-border-subtle"
            >
              {initialsOf(item.clientName)}
            </span>
          )}
          <span className={cn("min-w-0 truncate text-sm font-semibold", inactive ? "text-text-sec" : "text-text-main")}>
            {item.clientName}
          </span>
          {item.isNewClient && !inactive ? (
            <Badge size="xs" variant="success">
              {T.newBadge}
            </Badge>
          ) : null}
          <Badge size="xs" variant={JOURNAL_STATUS_TONE[statusKey]} data-testid="booking-row-status">
            {J.status[statusKey]}
          </Badge>
        </div>
        <p className="truncate text-xs text-text-sec">
          {services}
          {item.durationMin > 0 ? ` · ${UI_FMT.durationLabel(item.durationMin)}` : ""}
        </p>
        {showWorkContext ? (
          <div className="flex min-w-0">
            <WorkContextBadge context={item.workContext} />
          </div>
        ) : null}
        {proposed ? <p className="text-xs font-medium text-warning-text">{J.proposed(proposed)}</p> : null}
        {inactive && item.changeComment ? (
          <p className="line-clamp-2 text-2xs text-text-sec">{item.changeComment}</p>
        ) : null}
      </div>

      <div className="flex items-start gap-1">
        <span
          className={cn(
            "pt-0.5 font-display text-sm font-semibold tabular-nums",
            inactive ? "text-text-sec line-through" : "text-text-main",
          )}
        >
          {UI_FMT.priceLabel(item.price)}
        </span>
        {item.chatSlug ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="-mr-1.5 h-8 w-8 rounded-lg text-text-sec"
          >
            <Link
              href={`/cabinet/master/messages?c=${encodeURIComponent(item.chatSlug)}`}
              aria-label={J.message}
              title={J.message}
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>

      {awaitingAnswer || manageable || item.actions.noShow ? (
        <div className="col-span-3 mt-2 sm:col-span-2 sm:col-start-2 sm:max-w-md">
          {awaitingAnswer ? (
            <BookingCardActions
              bookingId={item.id}
              rawStatus={item.status}
              actionRequiredBy={item.actionRequiredBy}
              startAtUtc={item.startAtUtc}
            />
          ) : manageable && item.startAtUtc ? (
            <BookingManageActions
              bookingId={item.id}
              startAtUtc={item.startAtUtc}
              durationMin={Math.max(15, item.durationMin)}
              status={item.status}
            />
          ) : (
            <BookingNoShowAction bookingId={item.id} />
          )}
        </div>
      ) : null}
    </li>
  );
}
