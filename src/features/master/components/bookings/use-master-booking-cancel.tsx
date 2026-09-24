"use client";

import { useCallback } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import { ApiClientError } from "@/lib/http/client";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

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
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    if (res.ok && json?.ok) return { ok: true };
    const error = json && !json.ok ? json.error : null;
    return {
      ok: false,
      // FIX-C8: отказы здесь действенные («статус изменился — обновите
      // страницу», «поздно отменять») — строка сервера помечается `fromServer`,
      // и поверхность показывает её дословно (`serverMessageOr`).
      error: new ApiClientError({
        message: error?.message || fallback,
        code: error?.code,
        status: res.status,
        fromServer: Boolean(error?.message),
      }),
      packageId: error?.code === "PACKAGE_CANCEL_WHOLE" ? readPackageId(error.details) : null,
    };
  } catch {
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
