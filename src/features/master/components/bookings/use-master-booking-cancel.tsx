"use client";

import { useCallback } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import { ApiClientError, fetchJsonWithAuth } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.card;

type CancelAttempt =
  | { ok: true }
  | { ok: false; error: ApiClientError; packageId: string | null };

function readPackageId(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as { bookingPackageId?: unknown }).bookingPackageId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function send(url: string, init: RequestInit, fallback: string): Promise<CancelAttempt> {
  try {
    await fetchJsonWithAuth<unknown>(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    return { ok: true };
  } catch (error) {
    // FIX-C8: отказы здесь действенные («статус изменился — обновите
    // страницу», «поздно отменять») — строка сервера помечена `fromServer`
    // общим разбором, и поверхность показывает её дословно (`serverMessageOr`).
    if (error instanceof ApiClientError) {
      return {
        ok: false,
        error,
        packageId: error.code === "PACKAGE_CANCEL_WHOLE" ? readPackageId(error.details) : null,
      };
    }
    return { ok: false, error: new ApiClientError({ message: fallback, status: 0 }), packageId: null };
  }
}

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS — отмена записи мастером с выходом из
 * «пакет отменяется целиком». Компонент пакета в одиночку не отменяется
 * (инв. #34, LOGIC-04), и три поверхности кабинета (канбан, дашборд, меню
 * записи в расписании) упирались в 409 без следующего шага. Теперь на этот
 * отказ мастеру предлагается отменить пакет целиком тем же роутом, что у
 * клиента (`POST /api/bookings/package/[id]/cancel`, сторона провайдера).
 *
 * `cancelBooking` бросает `ApiClientError` (строка сервера — с `fromServer`);
 * `false` — мастер передумал отменять пакет.
 */
export function useMasterBookingCancel() {
  const { confirm, modal } = useConfirm();

  const cancelBooking = useCallback(
    async (bookingId: string, comment: string): Promise<boolean> => {
      const single = await send(
        `/api/master/bookings/${encodeURIComponent(bookingId)}/status`,
        { method: "PATCH", body: JSON.stringify({ status: "CANCELLED", comment }) },
        T.cancelError,
      );
      if (single.ok) return true;
      if (!single.packageId) throw single.error;

      const agreed = await confirm({
        title: T.packageCancelTitle,
        message: T.packageCancelMessage,
        confirmLabel: T.packageCancelConfirm,
        variant: "danger",
      });
      if (!agreed) return false;

      const whole = await send(
        `/api/bookings/package/${encodeURIComponent(single.packageId)}/cancel`,
        { method: "POST", body: JSON.stringify({ reason: comment }) },
        T.packageCancelError,
      );
      if (!whole.ok) throw whole.error;
      return true;
    },
    [confirm],
  );

  return { cancelBooking, modal } as const;
}
