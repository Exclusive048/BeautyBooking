import * as UI_TEXT from "@/lib/ui/text";
import type { AdminEventItem } from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.feed;

/** Тип события словами — общий для таблицы и выгрузки в Excel. */
export function adminEventTypeLabel(type: AdminEventItem["type"]): string {
  switch (type) {
    case "booking":
      return T.eventTypes.booking;
    case "booking_cancel":
      return T.eventTypes.bookingCancel;
    case "registration_master":
      return T.eventTypes.registrationMaster;
    case "registration_client":
      return T.eventTypes.registrationClient;
    case "subscription":
      return T.eventTypes.subscription;
    case "complaint":
      return T.eventTypes.complaint;
  }
}

/**
 * ADMIN-EVENTS-TABLE — колонки строки таблицы. У части событий первая строка
 * ленты совпадает с типом («Отмена записи», «Регистрация · клиент»), и в
 * таблице с отдельной колонкой «Тип» она повторялась бы дважды — тогда
 * описанием становится вторая строка.
 */
export function adminEventColumns(item: AdminEventItem): {
  typeLabel: string;
  description: string;
  detail: string;
} {
  const typeLabel = adminEventTypeLabel(item.type);
  if (item.primary === typeLabel) {
    return { typeLabel, description: item.secondary, detail: "" };
  }
  return { typeLabel, description: item.primary, detail: item.secondary };
}
