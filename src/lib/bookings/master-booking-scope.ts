import type { Prisma } from "@prisma/client";

/**
 * FIX-STUDIO-BLOCKERS-01 (F1) — the ONE spelling of «this master performs
 * this booking», shared by every master-cabinet read path.
 *
 * Booking keying differs by origin:
 *   - SOLO booking:   `providerId = the master's own provider`,
 *                     `masterProviderId = null` (funnel) or self (manual);
 *   - STUDIO booking: `providerId = the STUDIO's provider`,
 *                     `masterProviderId = the performing master`.
 *
 * The master cabinet used to filter `providerId = own` only — a condition a
 * studio booking never satisfies, which made a studio master's dashboard,
 * kanban and week schedule permanently empty (QA-FINDINGS-STUDIO F1). Other
 * read paths (day.service, analytics `buildScopeWhere`) already carried the
 * correct OR — this helper unifies the spelling so the paths can't drift
 * apart again (that drift WAS the bug).
 *
 * Access boundary (explicit):
 *   INCLUDED  — bookings the master performs: `masterProviderId = master`,
 *               plus unassigned bookings on their OWN provider
 *               (`masterProviderId = null AND providerId = master`) — the
 *               solo shape.
 *   EXCLUDED  — another master's bookings in the same studio
 *               (`masterProviderId = other`), and unassigned STUDIO
 *               bookings (`masterProviderId = null, providerId = studio`) —
 *               those belong to the studio journal until assigned.
 *
 * Pinned by `master-booking-scope.test.ts` (solo visible · own studio
 * booking visible · another master's studio booking NOT visible ·
 * unassigned studio booking NOT visible).
 */
export function masterPerformedBookingWhere(
  masterProviderIds: string | readonly string[],
): Prisma.BookingWhereInput {
  // STUDIO-MASTER-PROFILES (этап 4): у мастера может быть личный профиль и
  // профиль в студии — кабинет показывает записи ВСЕХ его профилей. Для одного
  // профиля форма прежняя дословно (её пинят тест и сырые SQL-копии аналитики).
  const ids =
    typeof masterProviderIds === "string" ? [masterProviderIds] : Array.from(new Set(masterProviderIds));
  if (ids.length === 1) {
    const masterProviderId = ids[0]!;
    return {
      OR: [
        { masterProviderId },
        { masterProviderId: null, providerId: masterProviderId },
      ],
    };
  }
  return {
    OR: [
      { masterProviderId: { in: ids } },
      { masterProviderId: null, providerId: { in: ids } },
    ],
  };
}
