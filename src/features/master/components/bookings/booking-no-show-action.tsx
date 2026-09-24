"use client";

import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarkNoShow } from "@/features/master/components/bookings/use-mark-no-show";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.card;

/**
 * NO-SHOW-UI: кнопка карточки колонки «Сегодня» канбана. В этой колонке запись
 * уже началась, поэтому «Перенести»/«Отменить» там всегда были выключены
 * (окно 60 минут до начала прошло) — единственное осмысленное действие здесь
 * неявка. Видимость решает вызывающий через `canMarkNoShow`.
 */
export function BookingNoShowAction({ bookingId }: { bookingId: string }) {
  const { markNoShow, busy, error, modal } = useMarkNoShow(bookingId);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void markNoShow()}
          className="w-full whitespace-nowrap"
        >
          <UserX className="h-3.5 w-3.5" aria-hidden strokeWidth={1.8} />
          {T.noShow}
        </Button>
        {error ? <p className="text-[11px] text-danger-text">{error}</p> : null}
      </div>
      {modal}
    </>
  );
}
