/**
 * Safe extractors for the polymorphic `payloadJson` blob attached to
 * notifications. The shape varies by `NotificationType`:
 *
 * - Booking-* (see `buildBookingPayload` in booking-notifications.ts):
 *   `{ bookingId, bookingStatus, providerId, providerName, providerType,
 *      masterProviderId, masterName, serviceId, serviceName, startAtUtc,
 *      clientName, clientUserId, studioId }`
 * - Review-* (review-notifications.ts):
 *   `{ reviewId, bookingId, authorId, rating }`
 * - Chat (CHAT_MESSAGE_RECEIVED via deliverNotification):
 *   `{ bookingId, senderType: "CLIENT" | "MASTER" }`
 *
 * Center.ts may have already merged a JSON-string payload into a real
 * object via `mergeBookingPayload`; we handle both shapes defensively.
 */

function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type NotificationPayload = {
  bookingId: string | null;
  bookingStatus: string | null;
  reviewId: string | null;
  clientUserId: string | null;
  authorId: string | null;
  rating: number | null;
  senderType: "CLIENT" | "MASTER" | null;
  serviceName: string | null;
  clientName: string | null;
  startAtUtc: string | null;
};

export function readNotificationPayload(raw: unknown): NotificationPayload {
  const record = parsePayload(raw);
  const senderRaw = readString(record, "senderType");
  return {
    bookingId: readString(record, "bookingId"),
    bookingStatus: readString(record, "bookingStatus"),
    reviewId: readString(record, "reviewId"),
    clientUserId: readString(record, "clientUserId"),
    authorId: readString(record, "authorId"),
    rating: readNumber(record, "rating"),
    senderType: senderRaw === "CLIENT" || senderRaw === "MASTER" ? senderRaw : null,
    serviceName: readString(record, "serviceName"),
    clientName: readString(record, "clientName"),
    startAtUtc: readString(record, "startAtUtc"),
  };
}
