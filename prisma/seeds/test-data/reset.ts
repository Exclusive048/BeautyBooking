import { prisma } from "./helpers/prisma";
import {
  SEED_EMAIL_DOMAIN,
  SEED_PHONE_PREFIX,
  SHOWCASE_PHONE_PREFIXES,
} from "./helpers/markers";

/**
 * Delete every UserProfile created by the test-data seed, identified by
 * email domain, the generic phone prefix, OR any showcase phone prefix.
 * Cascade FKs on UserProfile (Provider → MasterProfile / Studio / Service
 * / Booking / UserSubscription / Review / UserFavorite) wipe out
 * everything that depended on those rows.
 *
 * After SEED-CONSOLIDATION-A the OR clause also covers the four
 * showcase phone prefixes (+79991/+79992/+79993/+79994) so the reset
 * survives even if a showcase user lost its email marker. Real users
 * never use these prefixes — they're reserved for seed.
 *
 * Safe in dev. Refuses to run in production unless ALLOW_TEST_SEED is
 * set.
 */
async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_TEST_SEED) {
    console.error("⚠ Reset запрещён в production без ALLOW_TEST_SEED=true");
    process.exit(1);
  }

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

  console.log(`Deleting ${seedUsers.length} seed users (cascade clears related rows)...`);
  const deleted = await prisma.userProfile.deleteMany({
    where: { id: { in: seedUsers.map((u) => u.id) } },
  });
  console.log(`Done. Deleted ${deleted.count} users.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Reset failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
