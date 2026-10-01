import { assertSeedAllowed } from "../guard";
import { prisma } from "./helpers/prisma";
import {
  SEED_EMAIL_DOMAIN,
  SEED_PHONE_PREFIX,
  SHOWCASE_PHONE_PREFIXES,
} from "./helpers/markers";

/**
 * Delete every UserProfile created by the test-data seed, identified by
 * email domain, the generic phone prefix, OR any showcase phone prefix.
 *
 * FIX-20 (Item 3): `Provider.ownerUserId` and `Studio.ownerUserId` are
 * `onDelete: SetNull` — so deleting the seed users does NOT delete their
 * providers; it ORPHANS them (ownerUserId → null). Their `WeeklyScheduleConfig`
 * / `WeeklyScheduleDay` / templates / services / bookings then SURVIVE a reseed
 * (this previously left a stale weekday-0 row that masked a bug). So we now
 * delete the seed-owned **providers** explicitly first — that cascades
 * `WeeklyScheduleConfig`→`WeeklyScheduleDay`, `ScheduleTemplate`→breaks,
 * `ScheduleOverride`, `ScheduleBreak`, `Service`, `Studio`→memberships. Booking
 * has a Restrict FK on `serviceId`, so seed-provider bookings are cleared before
 * the provider cascade removes their services.
 *
 * After SEED-CONSOLIDATION-A the OR clause also covers the four
 * showcase phone prefixes (+79991/+79992/+79993/+79994) so the reset
 * survives even if a showcase user lost its email marker. Real users
 * never use these prefixes — they're reserved for seed.
 *
 * Safe in dev. Refuses to run in production unless ALLOW_TEST_SEED is set —
 * shared with `seed:test` via `prisma/seeds/guard.ts` (SEED-DEFUSE-01), so the
 * two entrypoints can no longer drift apart on what "allowed" means.
 */
async function main() {
  // SEED-DEFUSE-01 — первой строкой, до любого обращения к БД (см. prisma/seeds/guard.ts).
  assertSeedAllowed("seed:test:reset");

  const phoneFilters = [
    { phone: { startsWith: SEED_PHONE_PREFIX } },
    ...SHOWCASE_PHONE_PREFIXES.map((prefix) => ({ phone: { startsWith: prefix } })),
  ];

  const seedUsers = await prisma.userProfile.findMany({
    where: {
      OR: [{ email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } }, ...phoneFilters],
    },
    select: { id: true, email: true, phone: true },
  });

  if (seedUsers.length === 0) {
    console.log("No seed users found — nothing to delete.");
    await prisma.$disconnect();
    return;
  }

  const seedUserIds = seedUsers.map((u) => u.id);

  // FIX-20 (Item 3): delete seed-owned providers explicitly (ownerUserId is
  // SetNull, so a user delete would orphan them and leave their schedule config
  // behind). Clear seed-provider bookings first (Booking.serviceId is Restrict),
  // then the providers — that cascades schedule config / services / studios.
  const seedProviderIds = (
    await prisma.provider.findMany({
      where: { ownerUserId: { in: seedUserIds } },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (seedProviderIds.length > 0) {
    const bookings = await prisma.booking.deleteMany({
      where: { providerId: { in: seedProviderIds } },
    });
    // SCHEDULE-PATTERNS-01: `SchedulePatternDay.templateId` — `onDelete:
    // Restrict` (прошлые дни не должны стать выходными молча), а удаление
    // провайдера каскадом сносит и шаблоны, и графики — в порядке, которого
    // Postgres не обещает. Графики (дни уходят каскадом) — явно и раньше.
    await prisma.schedulePattern.deleteMany({
      where: { providerId: { in: seedProviderIds } },
    });
    const providers = await prisma.provider.deleteMany({
      where: { id: { in: seedProviderIds } },
    });
    console.log(
      `Cleared ${bookings.count} bookings + deleted ${providers.count} seed providers (cascade clears schedule config / services / studios).`,
    );
  }

  // STUDIO-SEED-01: `AdminAuditLog.adminUserId` is `onDelete: Restrict`
  // (invariant #16 — compliance history must outlive the admin). That FK also
  // makes the seed admin UNDELETABLE the moment anyone performs an admin action
  // in a seeded environment, so `seed:test:reset` started failing with P2003
  // after a QA pass touched /admin. Reset is dev-only (it refuses to run in
  // production without ALLOW_TEST_SEED), and these rows are audit trails of
  // *seed* admins acting on *seed* data — scoped strictly to seedUserIds so no
  // real admin's history is ever in range.
  const auditCleared = await prisma.adminAuditLog.deleteMany({
    where: { adminUserId: { in: seedUserIds } },
  });
  if (auditCleared.count > 0) {
    console.log(`Cleared ${auditCleared.count} AdminAuditLog rows for seed admins (FK is Restrict).`);
  }

  console.log(`Deleting ${seedUsers.length} seed users (cascade clears remaining related rows)...`);
  const deleted = await prisma.userProfile.deleteMany({
    where: { id: { in: seedUserIds } },
  });
  console.log(`Done. Deleted ${deleted.count} users.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Reset failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
