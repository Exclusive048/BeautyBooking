import type { NotificationType } from "@prisma/client";

/**
 * MOBILE-STUDIO-C (ops) — куда ведёт уведомление студии в ПРИЛОЖЕНИИ
 * (путь экрана, а не href веба). `null` — экрана нет, уведомление только
 * отмечается прочитанным.
 *
 * Запись открывается карточкой, только если она этой студии: карточка записи
 * (`GET /api/cabinet/studio/bookings/{id}`) другую студию не откроет.
 */
export function studioMobileNotificationLink(input: {
  type: NotificationType | "SCHEDULE_REQUEST";
  bookingId: string | null;
  bookingStudioId: string | null;
  studioId: string;
}): string | null {
  switch (input.type) {
    case "SCHEDULE_REQUEST":
    case "STUDIO_SCHEDULE_REQUEST":
      return "/studio/schedule-requests";
    case "STUDIO_INVITE_ACCEPTED":
    case "STUDIO_INVITE_REJECTED":
    case "STUDIO_MEMBER_LEFT":
    case "STUDIO_MEMBER_REMOVED":
    case "STUDIO_SCHEDULE_ENDING":
      return "/studio/team";
    case "REVIEW_LEFT":
      return "/studio/reviews";
    default:
      break;
  }
  if (input.type.startsWith("BOOKING_") && input.bookingId && input.bookingStudioId === input.studioId) {
    return `/studio/bookings/${input.bookingId}`;
  }
  return null;
}
