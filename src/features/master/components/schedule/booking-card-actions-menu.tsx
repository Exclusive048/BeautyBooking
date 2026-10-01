"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  MoreVertical,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMarkNoShow } from "@/features/master/components/bookings/use-mark-no-show";
import { useMasterBookingCancel } from "@/features/master/components/bookings/use-master-booking-cancel";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import type { BookingStatus } from "@prisma/client";
import { canMarkNoShow } from "@/lib/bookings/flow";
import { usePrompt } from "@/hooks/use-prompt";
import {
  isBookingPastConfirmWindow,
  isBookingPastModifyWindow,
} from "@/lib/bookings/action-state";
import { cn } from "@/lib/cn";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.cabinetMaster.schedule.bookingCard;

type Props = {
  bookingId: string;
  rawStatus: BookingStatus;
  startAtUtc: string;
  /** NO-SHOW-UI: конец приёма — окно неявки считается от него. */
  endAtUtc: string;
  durationMin: number;
  /**
   * MASTER-BOOKING-UI-FIX-A: when `rawStatus === "CHANGE_REQUESTED"`
   * the action-menu must distinguish initiator (gets «Ожидаем ответа»
   * guard) from the awaited side (gets confirm/decline buttons).
   * Determined by `Booking.actionRequiredBy` — for the master the
   * actionable side is `"MASTER"`. `null` means no pending change
   * (booking is in plain PENDING/CONFIRMED), `"CLIENT"` means we're
   * the initiator and waiting for client response.
   */
  actionRequiredBy?: "CLIENT" | "MASTER" | null;
};

type ActionId = "confirm" | "decline" | "reschedule" | "cancel";

/**
 * 3-dots popover menu on each week-grid booking card.
 *
 * fix-02: the popover used to live inside the booking card's
 * `overflow-hidden` container, which clipped it whenever the menu
 * extended past the card edge. It now renders through `createPortal`
 * to `document.body` with a computed `position: fixed` placement, so
 * it floats above everything regardless of the parent's stacking /
 * clipping context. Position is recomputed on open + on scroll /
 * resize while open.
 */
export function BookingCardActionsMenu({
  bookingId,
  rawStatus,
  startAtUtc,
  endAtUtc,
  durationMin,
  actionRequiredBy = null,
}: Props) {
  const router = useRouter();
  const { prompt, modal: promptModal } = usePrompt();
  const noShow = useMarkNoShow(bookingId);
  const { cancelBooking, modal: packageModal } = useMasterBookingCancel();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  // MODAL-SSR-OPEN-HYDRATION: общий гейт портала вместо setState в эффекте.
  const mounted = useIsHydrated();

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const MENU_WIDTH = 192; // matches w-48
    // Prefer aligning the menu's right edge with the trigger's right edge.
    let left = rect.right - MENU_WIDTH;
    if (left < 8) left = 8;
    const right = left + MENU_WIDTH;
    if (right > window.innerWidth - 8) {
      left = window.innerWidth - 8 - MENU_WIDTH;
    }
    setCoords({
      top: rect.bottom + 4,
      left,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => reposition();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  const patchStatus = useCallback(
    async (action: ActionId, status: "CONFIRMED" | "REJECTED" | "CANCELLED", comment?: string) => {
      setBusy(action);
      setError(null);
      try {
        await fetchJsonWithAuth<unknown>(`/api/master/bookings/${bookingId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
        });
        setOpen(false);
        startTransition(() => router.refresh());
      } catch (err) {
        setError(serverMessageOr(err, T.actionError));
      } finally {
        setBusy(null);
      }
    },
    [bookingId, router],
  );

  const handleConfirm = () => {
    void patchStatus("confirm", "CONFIRMED");
  };
  const handleDecline = async () => {
    setOpen(false);
    const comment = await prompt({
      title: T.declineTitle,
      label: T.declineLabel,
      placeholder: T.declinePlaceholder,
      confirmLabel: T.declineConfirmLabel,
      variant: "danger",
    });
    if (!comment) return;
    void patchStatus("decline", "REJECTED", comment);
  };
  const handleCancel = async () => {
    setOpen(false);
    const comment = await prompt({
      title: T.cancelTitle,
      label: T.cancelLabel,
      placeholder: T.cancelPlaceholder,
      confirmLabel: T.cancelConfirmLabel,
      variant: "danger",
    });
    if (!comment) return;
    // BOOKING-FLOW-AUDIT-RESIDUALS: компонент пакета — с предложением
    // отменить весь пакет (`useMasterBookingCancel`).
    setBusy("cancel");
    setError(null);
    try {
      const cancelled = await cancelBooking(bookingId, comment);
      if (cancelled) startTransition(() => router.refresh());
    } catch (err) {
      setError(serverMessageOr(err, T.actionError));
    } finally {
      setBusy(null);
    }
  };
  const handleReschedule = () => {
    setOpen(false);
    setRescheduleOpen(true);
  };
  const handleNoShow = () => {
    setOpen(false);
    void noShow.markNoShow();
  };

  // MASTER-RESCHEDULE-FIX-A: split PENDING vs CHANGE_REQUESTED so the
  // reschedule menu item disappears while a previous change request is
  // still awaiting a response. The old combined `isPending` was the #5а
  // bug: it offered «Перенести» on a CHANGE_REQUESTED booking → submit
  // hit the backend's "already has a pending change request" 409.
  // Confirm/Decline remain in CHANGE_REQUESTED so the master can accept
  // or reject the OTHER side's proposed move.
  const isPendingNew = rawStatus === "PENDING";
  const isAwaitingResponse = rawStatus === "CHANGE_REQUESTED";
  const isConfirmed = rawStatus === "CONFIRMED" || rawStatus === "PREPAID";
  const canReschedule = isPendingNew || isConfirmed;
  // MASTER-BOOKING-UI-FIX-A #2а: confirm/decline for CHANGE_REQUESTED
  // only when the master is the awaited side. If the master is the
  // initiator (`actionRequiredBy === "CLIENT"`), the menu shows a
  // «Ожидаем ответа» hint instead — preventing the «Action is
  // required from another side» 409 backend error.
  const canConfirmOrDecline =
    isPendingNew || (isAwaitingResponse && actionRequiredBy === "MASTER");
  const isInitiatorWaitingResponse =
    isAwaitingResponse && actionRequiredBy === "CLIENT";
  // MASTER-DASHBOARD-FIX-A #3: time-window guards mirror the backend's
  // `ensureBookingActionWindow` (60 min before start) and the runtime
  // promotion in `resolveBookingRuntimeStatus` (start passed → no
  // longer confirmable). Disable (visibility-over-hiding) so the menu
  // structure stays predictable while pre-empting 409 responses.
  const startDate = new Date(startAtUtc);
  const isPastModifyWindow = isBookingPastModifyWindow(startDate);
  const isPastConfirmWindow = isBookingPastConfirmWindow(startDate);
  // NO-SHOW-UI: то же правило, что проверяет сервер (`canMarkNoShow`).
  const canNoShow = canMarkNoShow({
    status: rawStatus,
    startAtUtc: startDate,
    endAtUtc: new Date(endAtUtc),
  });
  const modifyTooltip = UI_TEXT.cabinetMaster.dashboard.bookings.modifyWindowExpiredTooltip;
  const confirmTooltip = UI_TEXT.cabinetMaster.dashboard.bookings.confirmWindowExpiredTooltip;

  const menuContent =
    open && coords ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-popover w-48 overflow-hidden rounded-xl border border-border-subtle bg-bg-card shadow-card"
        style={{ top: coords.top, left: coords.left }}
        onClick={(event) => event.stopPropagation()}
      >
        {canConfirmOrDecline ? (
          <>
            <MenuItem
              icon={Check}
              onClick={handleConfirm}
              disabled={busy !== null || isPastConfirmWindow}
              title={isPastConfirmWindow ? confirmTooltip : undefined}
            >
              {T.confirm}
            </MenuItem>
            <MenuItem
              icon={X}
              onClick={handleDecline}
              disabled={busy !== null || isPastConfirmWindow}
              title={isPastConfirmWindow ? confirmTooltip : undefined}
            >
              {T.decline}
            </MenuItem>
          </>
        ) : null}
        {canReschedule ? (
          <MenuItem
            icon={Calendar}
            onClick={handleReschedule}
            disabled={busy !== null || isPastModifyWindow}
            title={isPastModifyWindow ? modifyTooltip : undefined}
          >
            {T.reschedule}
          </MenuItem>
        ) : null}
        {isInitiatorWaitingResponse ? (
          <p className="border-t border-border-subtle bg-bg-input/30 px-3 py-2 text-2xs leading-snug text-text-sec">
            {T.awaitingClientResponse}
          </p>
        ) : null}
        {isConfirmed ? (
          <MenuItem
            icon={X}
            onClick={handleCancel}
            disabled={busy !== null || isPastModifyWindow}
            title={isPastModifyWindow ? modifyTooltip : undefined}
            variant="danger"
          >
            {T.cancel}
          </MenuItem>
        ) : null}
        {canNoShow ? (
          <MenuItem icon={UserX} onClick={handleNoShow} disabled={busy !== null || noShow.busy}>
            {UI_TEXT.cabinetMaster.bookings.card.noShow}
          </MenuItem>
        ) : null}
        {error ? (
          <p className="border-t border-border-subtle px-3 py-2 text-2xs text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div className="absolute right-1 top-1">
        <Button variant="wrapper"
          ref={triggerRef}
          aria-label={T.actionsAria}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
          className="grid h-6 w-6 place-items-center rounded-md bg-black/10 text-current opacity-0 transition-opacity hover:bg-black/20 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0 [&[aria-expanded=true]]:opacity-100"
          aria-expanded={open}
        >
          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      {mounted && menuContent ? createPortal(menuContent, document.body) : null}

      <RescheduleModal
        open={rescheduleOpen}
        bookingId={bookingId}
        startAtUtc={startAtUtc}
        durationMin={durationMin}
        onClose={() => setRescheduleOpen(false)}
      />

      {promptModal}
      {noShow.modal}
      {packageModal}
      {noShow.error ? (
        // Меню к моменту ответа уже закрыто — отказ показывается на карточке.
        <p role="alert" className="absolute inset-x-1 bottom-1 rounded bg-bg-card/95 px-1.5 py-1 text-3xs leading-tight text-danger-text">
          {noShow.error}
        </p>
      ) : null}
    </>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  disabled,
  variant = "default",
  title,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  title?: string;
  children: ReactNode;
}) {
  return (
    <Button variant="wrapper"
      onClick={onClick}
      disabled={disabled}
      title={title}
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-input/70 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "danger" ? "text-danger-text" : "text-text-main",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </Button>
  );
}
