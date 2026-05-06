import { prisma } from "./helpers/prisma";
import { SEED_EMAIL_DOMAIN, SEED_PHONE_PREFIX } from "./helpers/markers";

/**
 * Delete every UserProfile created by the test-data seed, identified by the
 * email domain or phone prefix. Cascade FKs on UserProfile (Provider →
 * MasterProfile / Studio / Service / Booking / UserSubscription / Review /
 * UserFavorite) wipe out everything that depended on those rows.
 *
 * Safe in dev. Refuses to run in production unless ALLOW_TEST_SEED is set.
 */
async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_TEST_SEED) {
    console.error("⚠ Reset запрещён в production без ALLOW_TEST_SEED=true");
    process.exit(1);
  }

  const seedUsers = await prisma.userProfile.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
        { phone: { startsWith: SEED_PHONE_PREFIX } },
      ],
    },
    select: { id: true, email: true },
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
