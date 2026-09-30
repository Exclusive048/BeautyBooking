"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/use-confirm";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.card;

/**
 * NO-SHOW-UI (2026-09-24) — «Отметить неявку» для трёх поверхностей кабинета
 * мастера (канбан «Сегодня», меню записи в расписании, строка дашборда). Раньше
 * `PATCH …/status` с `NO_SHOW` был рабочим, но ни одна поверхность его не звала.
 *
 * Когда показывать — решает `canMarkNoShow` (`lib/bookings/flow.ts`), то же
 * правило, что проверяет сервер. Отказ сервера показывается дословно
 * (FIX-C8): «приём ещё не начался», «окно закрылось», `BOOKING_STATUS_CHANGED`
 * — у каждого своё действие, и общий «Попробуйте ещё раз» ни одному не помог бы.
 */
export function useMarkNoShow(bookingId: string) {
  const router = useRouter();
  const { confirm, modal } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const markNoShow = useCallback(async () => {
    const ok = await confirm({
      title: T.noShowTitle,
      message: T.noShowMessage,
      confirmLabel: T.noShowConfirmLabel,
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/master/bookings/${encodeURIComponent(bookingId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NO_SHOW" }),
      });
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(serverMessageOr(caught, T.noShowError));
    } finally {
      setBusy(false);
    }
  }, [bookingId, confirm, router]);

  return { markNoShow, busy, error, modal } as const;
}
