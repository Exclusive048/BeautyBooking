import type { BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";

/**
 * BOOKINGS-JOURNAL — какое состояние показать у записи в журнале (кабинеты
 * мастера и студии). Чистый модуль без `server-only`.
 *
 * Сохранённый статус решает там, где время ничего не меняет: отменённая,
 * неявка, неподтверждённая (ждёт ответа, даже если время уже прошло —
 * её снимет истечение, PENDING-EXPIRY), запрос переноса. Подтверждённую
 * время превращает в «идёт» и «завершена» — тем же правилом, что везде
 * (`resolveBookingRuntimeStatus`): сохранённый `FINISHED` пишет воркер
 * не сразу (BOOKING-FINALIZE-01).
 */
export type JournalStatusKey =
  | "PENDING"
  | "CHANGE_REQUESTED"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELLED"
  | "NO_SHOW";

export const JOURNAL_STATUS_TONE: Record<JournalStatusKey, "warning" | "success" | "info" | "muted" | "danger"> = {
  PENDING: "warning",
  CHANGE_REQUESTED: "warning",
  CONFIRMED: "success",
  IN_PROGRESS: "info",
  FINISHED: "muted",
  CANCELLED: "muted",
  NO_SHOW: "danger",
};

export function journalStatusKey(input: {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  now: Date;
}): JournalStatusKey {
  switch (input.status) {
    case "CANCELLED":
    case "REJECTED":
      return "CANCELLED";
    case "NO_SHOW":
      return "NO_SHOW";
    case "NEW":
    case "PENDING":
      return "PENDING";
    case "CHANGE_REQUESTED":
      return "CHANGE_REQUESTED";
    case "FINISHED":
      return "FINISHED";
    default: {
      const runtime = resolveBookingRuntimeStatus(input);
      if (runtime === "IN_PROGRESS") return "IN_PROGRESS";
      if (runtime === "FINISHED") return "FINISHED";
      return "CONFIRMED";
    }
  }
}

/** Отменённая и неявка — в списке приглушены: в день они не идут. */
export function isJournalStatusInactive(key: JournalStatusKey): boolean {
  return key === "CANCELLED" || key === "NO_SHOW";
}
