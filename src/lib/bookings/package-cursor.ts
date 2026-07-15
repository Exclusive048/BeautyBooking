/**
 * PACKAGE-SOLO-WIZARD-01 — the solo package wizard's sequential cursor.
 *
 * Client-safe (pure Date math, zero imports — rule 13): the public package
 * wizard imports this, so it must never reach Prisma/Redis.
 *
 * Why this exists as a shared, tested helper rather than an inline expression:
 * a solo package's components are sequential along the CLIENT's timeline, but
 * the backend does NOT enforce order — `createSoloPackageBooking` enforces
 * non-OVERLAP (`intraPackageOverlap(placement, bufferMin)`) and nothing more.
 * The widget's cursor IS the order constraint, so the gap it applies must match
 * the gap the create demands exactly:
 *
 *   - too small → the wizard offers a slot the create then rejects with 409
 *     (the client picks a time, fills in contacts, and only then gets an error),
 *   - too large → bookable slots are silently hidden.
 *
 * `package-cursor.test.ts` pins it to `intraPackageOverlap`'s real acceptance
 * boundary, so a change to the buffer semantics on either side fails a test
 * instead of a client's booking.
 *
 * NOTE the studio wizard uses the previous end with NO buffer — correct THERE
 * because its by-client guard (`intraPackageOverlapMultiMaster`) applies buffer
 * 0 to different-master pairs (the client just walks to another chair). Solo is
 * one master, so the master's own between-bookings buffer applies.
 */

/**
 * The earliest instant at which the next solo package component may start,
 * given the previous component's end and the master's between-bookings buffer.
 *
 * @param prevEndAtUtc — the previous component's end (UTC).
 * @param bufferMin — the master's normalized between-bookings buffer, minutes.
 */
export function nextComponentEarliestStart(prevEndAtUtc: Date, bufferMin: number): Date {
  const buffer = Math.max(0, Math.floor(bufferMin)) * 60_000;
  return new Date(prevEndAtUtc.getTime() + buffer);
}
