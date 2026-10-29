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
 * The STUDIO wizard has the same contract with `intraPackageOverlapMultiMaster`
 * but a conditional gap: buffer 0 between different masters (the client just
 * walks to another chair), the master's own buffer between same-master
 * components — see `studioNextComponentEarliestStart` below
 * (PACKAGE-STUDIO-SAME-MASTER-BUFFER).
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

/** An already-placed studio package component, as the cursor needs it. */
export type StudioPlacedComponent = {
  masterProviderId: string;
  endAtUtc: Date;
};

/**
 * PACKAGE-STUDIO-SAME-MASTER-BUFFER — the STUDIO package wizard's cursor.
 *
 * The by-client guard the create runs (`intraPackageOverlapMultiMaster`)
 * applies the master's buffer ONLY to same-master pairs (different masters →
 * buffer 0: the client just walks to another chair). The old cursor was a
 * flat `prevEnd`, which is exactly right for different-master pairs and
 * exactly wrong for same-master ones — it offered the back-to-back slot the
 * validator then 409'd at review.
 *
 * The earliest valid start is therefore the max over every constraint the
 * validator will actually check, given components stay sequential:
 *   - the previous component's end (client-timeline order, any master);
 *   - for EVERY earlier component performed by the same chosen master:
 *     its end + that master's buffer. Not just the adjacent one — an
 *     A-B-A pattern (short B in the middle, large buffer) re-triggers the
 *     same 409 through the non-adjacent (A, A) pair.
 *
 * @param input.prevEndAtUtc — the immediately previous component's end (UTC).
 * @param input.placed — ALL earlier placed components (master + end).
 * @param input.masterProviderId — the master chosen for the NEXT component.
 * @param input.masterBufferMin — that master's between-bookings buffer, min.
 */
export function studioNextComponentEarliestStart(input: {
  prevEndAtUtc: Date;
  placed: StudioPlacedComponent[];
  masterProviderId: string;
  masterBufferMin: number;
}): Date {
  let earliestMs = input.prevEndAtUtc.getTime();
  for (const component of input.placed) {
    if (component.masterProviderId !== input.masterProviderId) continue;
    const constraint = nextComponentEarliestStart(component.endAtUtc, input.masterBufferMin);
    if (constraint.getTime() > earliestMs) earliestMs = constraint.getTime();
  }
  return new Date(earliestMs);
}
