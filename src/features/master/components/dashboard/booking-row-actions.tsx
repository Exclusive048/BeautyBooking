"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquare, CalendarClock, X } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import { isBookingPastModifyWindow } from "@/lib/bookings/action-state";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

type Props = {
  booking: DashboardBooking;
};

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45";

const TERMINAL_STATUSES = new Set([
  "FINISHED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
] as const);

/**
 * 3 icon actions for the dashboard «Ближайшие записи» rows:
 *
 *   • Chat       — deep-link to /cabinet/master/messages?c=<slug>
 *   • Reschedule — opens the shared `<RescheduleModal>` from schedule
 *   • Cancel     — confirm dialog → PATCH master booking status
 *
 * Cancel + reschedule are hidden for terminal statuses (FINISHED /
 * CANCELLED / REJECTED / NO_SHOW). Chat stays visible because the
 * thread history remains accessible after a booking ends.
 *
 * Chat is also hidden when the booking is a guest one (no
 * `chatSlug`) since there is no registered client to message.
 *
 * chat-url-fix: the chat URL used to embed `<providerId:clientUserId>`
 * which leaked internal cuids. The slug is now resolved server-side
 * in `dashboard.service.ts` and arrives on the DTO as `chatSlug`.
 */
export function BookingRowActions({ booking }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { confirm, modal } = useConfirm();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATUSES.has(
    booking.status as (typeof TERMINAL_STATUSES extends Set<infer V> ? V : never),
  );
  // MASTER-RESCHEDULE-FIX-A: hide Reschedule when a previous change
  // request is awaiting a response. Backend rejects with 409 "already
  // has a pending change request" — UI should not even offer the
  // action. The other side resolves the proposal first.
  const isAwaitingChangeResponse = booking.status === "CHANGE_REQUESTED";
  // MASTER-DASHBOARD-FIX-A #3: cancel/reschedule are forbidden by
  // the backend's `ensureBookingActionWindow` within 60 min of start.
  // Disable (don't hide) the buttons in that window so the master
  // can still see they exist — surfaced via tooltip explaining the
  // 60-min rule. Visibility-over-hiding per the design system.
  const isPastModifyWindow = isBookingPastModifyWindow(booking.startAtUtc);
  const chatHref = booking.chatSlug
    ? `/cabinet/master/messages?c=${encodeURIComponent(booking.chatSlug)}`
    : null;

  async function handleCancel() {
    const ok = await confirm({
      title: T.cancelConfirmTitle,
      message: T.cancelConfirmMessage,
      confirmLabel: T.cancelConfirmCta,
      variant: "danger",
    });
    if (!ok) return;
    setCancelling(true);
    setError(null);
    try {
      await fetchJson(`/api/master/bookings/${encodeURIComponent(booking.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      startTransition(() => router.refresh());
    } catch (caught) {
      // FIX-C8 · fromServer = ПОКАЗАТЬ СЕРВЕРНОЕ. Прежняя форма — `if (!res.ok)
      // throw new Error(T.cancelFailed)` — та самая, что называет постановка:
      // тело не разбиралось ВООБЩЕ, поэтому `err.message` ниже всегда был
      // собственной строкой, а `instanceof Error`-ветка создавала видимость
      // passthrough. Три отказа этого эндпоинта каждый требуют СВОЕГО действия,
      // и «Не удалось отменить запись. Попробуйте ещё раз.» не подсказывает
      // ни одного:
      //
      //   • `PACKAGE_CANCEL_WHOLE` 409 «Этот пакет отменяется целиком.» —
      //     инв. #34: компонент пакета в одиночку не отменяется никогда, то
      //     есть повтор не поможет ни при какой попытке. Действие — отменить
      //     пакет целиком.
      //   • `BOOKING_STATUS_CHANGED` 409 (LOGIC-02) — «Статус записи
      //     изменился. Обновите страницу»: строка мастера устарела (клиент уже
      //     отменил сам). Действие — обновить, а не повторять отмену.
      //   • `CANCELLATION_DEADLINE_PASSED` / `SLOT_CONFLICT` — свои курируемые
      //     строки.
      //
      // Своя строка остаётся дефолтом для обрыва сети и 5xx без тела.
      setError(serverMessageOr(caught, T.cancelFailed));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <div className="flex gap-1">
        {chatHref ? (
          <Link
            href={chatHref}
            aria-label={T.chatAction}
            title={T.chatAction}
            className={ICON_BUTTON}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}

        {!isTerminal && !isAwaitingChangeResponse ? (
          <button
            type="button"
            aria-label={T.rescheduleAction}
            title={isPastModifyWindow ? T.modifyWindowExpiredTooltip : T.rescheduleAction}
            className={`${ICON_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-sec`}
            onClick={() => setRescheduleOpen(true)}
            disabled={isPastModifyWindow}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        {!isTerminal ? (
          <button
            type="button"
            aria-label={T.cancelAction}
            title={isPastModifyWindow ? T.modifyWindowExpiredTooltip : T.cancelAction}
            className={`${ICON_BUTTON} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-sec`}
            onClick={() => void handleCancel()}
            disabled={cancelling || isPastModifyWindow}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* UI-26/27: статусная поверхность — токен, не сырой `red-*`. */}
      {error ? (
        <p className="mt-1 text-[11px] text-danger-text" role="alert">
          {error}
        </p>
      ) : null}

      {rescheduleOpen ? (
        <RescheduleModal
          open
          bookingId={booking.id}
          startAtUtc={booking.startAtUtc.toISOString()}
          durationMin={booking.durationMin}
          onClose={() => setRescheduleOpen(false)}
        />
      ) : null}

      {modal}
    </>
  );
}
