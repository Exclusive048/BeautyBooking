import { BookingStatus, type Prisma } from "@prisma/client";

/**
 * FIX-7 (HARDENING-04): the `where` for counting a client's PRIOR bookings with
 * this provider (the `acceptNewClients=false` returning-client gate).
 *
 * The previous inline filter was
 *   `OR: [{ providerId }, { masterProviderId: resolvedMasterProviderId ?? undefined }]`
 * — when no master is chosen (a studio booking without a picked master),
 * `resolvedMasterProviderId` is null → `{ masterProviderId: undefined }` → Prisma
 * DROPS the key → `{}` → an OR clause that matches EVERYTHING, so the count went
 * platform-wide and a first-time-to-this-provider client with any history
 * elsewhere bypassed the gate.
 *
 * Scope, built conditionally so a `{ field: undefined }` never enters an OR:
 *  - master chosen  → prior with THIS provider OR THIS master;
 *  - no master      → prior with THIS provider only.
 * Cancelled/rejected/no-show don't represent an existing relationship.
 */
export function buildPriorBookingsWhere(input: {
  clientUserId: string;
  providerId: string;
  masterProviderId: string | null;
}): Prisma.BookingWhereInput {
  const scope: Prisma.BookingWhereInput = input.masterProviderId
    ? { OR: [{ providerId: input.providerId }, { masterProviderId: input.masterProviderId }] }
    : { providerId: input.providerId };

  return {
    clientUserId: input.clientUserId,
    ...scope,
    status: {
      notIn: [BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
    },
  };
}
