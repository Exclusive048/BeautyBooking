export const CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS = 600;

export function buildCreateBookingIdempotencyKey(userId: string, requestId: string): string {
  return `idempotency:createBooking:${userId}:${requestId}`;
}
