/**
 * Multi-city migration: providers without an address can no longer be
 * published. The new domain requires every published provider to have a
 * geocoded `cityId`, which in turn requires a non-empty address.
 *
 * Run order:
 *   1. `npx tsx scripts/unpublish-providers-without-address.ts`            — dry run
 *   2. Inspect the counts, confirm with the team
 *   3. `npx tsx scripts/unpublish-providers-without-address.ts --confirm`  — execute
 *
 * Provider.address is `String NOT NULL` in the schema — empty providers carry
 * "" (or whitespace from manual seed/test data), never NULL.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Match the most common "empty" representations seen in the codebase
// (delete-master.ts, profiles/professional.ts both seed `address: ""`).
const EMPTY_ADDRESS_VARIANTS = ["", " ", "  ", "   "];

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--confirm");
  console.log(dryRun ? "🔍 DRY RUN" : "🔥 LIVE RUN");

  const totalWithoutAddress = await prisma.provider.count({
    where: { address: { in: EMPTY_ADDRESS_VARIANTS } },
  });

  const publishedWithoutAddress = await prisma.provider.count({
    where: {
      isPublished: true,
      address: { in: EMPTY_ADDRESS_VARIANTS },
    },
  });

  const publishedTotal = await prisma.provider.count({ where: { isPublished: true } });
  const total = await prisma.provider.count();

  console.log("");
  console.log(`Providers total:                     ${total}`);
  console.log(`  Published:                         ${publishedTotal}`);
  console.log(`Providers without address (total):   ${totalWithoutAddress}`);
  console.log(`  Of these, currently published:     ${publishedWithoutAddress}`);
  console.log("");

  if (publishedWithoutAddress === 0) {
    console.log("✓ Nothing to unpublish.");
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log(`⚠️  DRY RUN: would unpublish ${publishedWithoutAddress} provider(s).`);
    console.log("   Re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.provider.updateMany({
    where: {
      isPublished: true,
      address: { in: EMPTY_ADDRESS_VARIANTS },
    },
    data: { isPublished: false },
  });

  console.log(`✅ Unpublished ${result.count} provider(s) without address.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
