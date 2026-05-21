"use client";

import { useState } from "react";
import { ArrowRightLeft, Clock, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleBookingCell, ScheduleMasterColumn } from "../../server/types";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { MoveBookingDialog } from "./move-booking-dialog";

const T = UI_TEXT.studioCabinet.scheduleV2;

type Props = {
  studioId: string;
  booking: ScheduleBookingCell | null;
  masters: ScheduleMasterColumn[];
  onClose: () => void;
};

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) =>
    d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} — ${fmt(end)}`;
}

export function BookingActionMenu({
  studioId,
  booking,
  masters,
  onClose,
}: Props) {
  const [moveMode, setMoveMode] = useState<"master" | "time" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const open = booking !== null;

  function handleClose() {
    setMoveMode(null);
    setCancelOpen(false);
    onClose();
  }

  return (
    <>
      <ModalSurface
        open={open && !moveMode && !cancelOpen}
        onClose={handleClose}
        title={T.actions.menuTitle}
      >
        {booking ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border-subtle bg-bg-input/40 p-3">
              <div className="flex items-center gap-2 text-xs text-text-sec">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {formatRange(booking.startAtUtc, booking.endAtUtc)}
              </div>
              <p className="mt-1.5 text-sm font-semibold text-text-main">
                {booking.clientName || "—"}
              </p>
              <p className="text-xs text-text-sec">{booking.serviceTitle}</p>
              {booking.priceKopeks > 0 ? (
                <p className="mt-1 font-mono text-xs text-text-sec">
                  {UI_FMT.priceLabel(booking.priceKopeks)}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="secondary"
                onClick={() => setMoveMode("master")}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                {T.actions.moveToMaster}
              </Button>
              <Button variant="secondary" onClick={() => setMoveMode("time")}>
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {T.actions.moveTime}
              </Button>
              <Button
                variant="ghost"
                onClick={handleClose}
                title={booking.clientPhone ?? undefined}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
                {T.actions.details}
              </Button>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                <X className="h-3.5 w-3.5" aria-hidden />
                {T.actions.cancel}
              </Button>
            </div>
          </div>
        ) : null}
      </ModalSurface>

      {booking && moveMode ? (
        <MoveBookingDialog
          studioId={studioId}
          bookingId={booking.id}
          currentMasterId={booking.masterId}
          currentStartAtUtc={booking.startAtUtc}
          bookingServiceId={booking.serviceId}
          masters={masters}
          mode={moveMode}
          open
          onClose={() => {
            setMoveMode(null);
            onClose();
          }}
        />
      ) : null}

      {booking && cancelOpen ? (
        <CancelBookingDialog
          bookingId={booking.id}
          clientName={booking.clientName}
          serviceTitle={booking.serviceTitle}
          open
          onClose={() => {
            setCancelOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
