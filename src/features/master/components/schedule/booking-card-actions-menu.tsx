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
  X,
  type LucideIcon,
} from "lucide-react";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import { cn } from "@/lib/cn";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.bookingCard;

type Props = {
  bookingId: string;
  rawStatus: string;
  startAtUtc: string;
  durationMin: number;
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
  durationMin,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        const res = await fetch(`/api/master/bookings/${bookingId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
        }
        setOpen(false);
        startTransition(() => router.refresh());
      } catch (err) {
        setError(err instanceof Error ? err.message : T.actionError);
      } finally {
        setBusy(null);
      }
    },
    [bookingId, router],
  );

  const handleConfirm = () => {
    void patchStatus("confirm", "CONFIRMED");
  };
  const handleDecline = () => {
    const comment = window.prompt(T.declinePrompt, "")?.trim();
    if (!comment) return;
    void patchStatus("decline", "REJECTED", comment);
  };
  const handleCancel = () => {
    const comment = window.prompt(T.cancelPrompt, "")?.trim();
    if (!comment) return;
    void patchStatus("cancel", "CANCELLED", comment);
  };
  const handleReschedule = () => {
    setOpen(false);
    setRescheduleOpen(true);
  };

  const isPending = rawStatus === "PENDING" || rawStatus === "CHANGE_REQUESTED";
  const isConfirmed = rawStatus === "CONFIRMED" || rawStatus === "PREPAID";

  const menuContent =
    open && coords ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[9999] w-48 overflow-hidden rounded-xl border border-border-subtle bg-bg-card shadow-card"
        style={{ top: coords.top, left: coords.left }}
        onClick={(event) => event.stopPropagation()}
      >
        {isPending ? (
          <>
            <MenuItem icon={Check} onClick={handleConfirm} disabled={busy !== null}>
              {T.confirm}
            </MenuItem>
            <MenuItem icon={X} onClick={handleDecline} disabled={busy !== null}>
              {T.decline}
            </MenuItem>
          </>
        ) : null}
        {isPending || isConfirmed ? (
          <MenuItem icon={Calendar} onClick={handleReschedule} disabled={busy !== null}>
            {T.reschedule}
          </MenuItem>
        ) : null}
        {isConfirmed ? (
          <MenuItem
            icon={X}
            onClick={handleCancel}
            disabled={busy !== null}
            variant="danger"
          >
            {T.cancel}
          </MenuItem>
        ) : null}
        {error ? (
          <p className="border-t border-border-subtle px-3 py-2 text-[11px] text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div className="absolute right-1 top-1">
        <button
          ref={triggerRef}
          type="button"
          aria-label={T.actionsAria}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
          className="grid h-6 w-6 place-items-center rounded-md bg-black/10 text-current opacity-0 transition-opacity hover:bg-black/20 focus-visible:opacity-100 group-hover:opacity-100 md:opacity-0 [&[aria-expanded=true]]:opacity-100"
          aria-expanded={open}
        >
          <MoreVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {mounted && menuContent ? createPortal(menuContent, document.body) : null}

      <RescheduleModal
        open={rescheduleOpen}
        bookingId={bookingId}
        startAtUtc={startAtUtc}
        durationMin={durationMin}
        onClose={() => setRescheduleOpen(false)}
      />
    </>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  disabled,
  variant = "default",
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-input/70 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "danger" ? "text-red-600 dark:text-red-400" : "text-text-main",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </button>
  );
}
