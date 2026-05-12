/**
 * OPTIONAL UTILITY — multi-city retro-fit for existing data.
 *
 * Walks all published providers that have a non-empty address but no
 * `cityId`, calls the Yandex Geocoder for each, and links the city
 * (auto-creating it if needed via the same `detectCityFromAddress` flow
 * that's used at write-time).
 *
 * USE WITH CAUTION:
 *   - This calls Yandex Geocoder once per provider. The free tier has a
 *     daily request quota — running on a large dataset can blow through it.
 *   - Script throttles itself to ~10 req/sec to stay polite.
 *   - Run with `--confirm` to apply; without it you get a dry-run summary.
 *   - Best run during off-peak hours, on small batches via `--limit=N`.
 *   - `--retry-broken` re-tries providers whose previous detection failed
 *     (cityId is null but address is non-empty); without it those rows are
 *     skipped to avoid burning quota on permanently-bad addresses.
 *
 * Examples:
 *   npx tsx scripts/backfill-cities-from-addresses.ts                 # dry run, all
 *   npx tsx scripts/backfill-cities-from-addresses.ts --limit=20      # dry run, 20
 *   npx tsx scripts/backfill-cities-from-addresses.ts --confirm       # live, all
 */
import { PrismaClient } from "@prisma/client";
import { detectCityFromAddress } from "@/lib/cities/detect-city";

const prisma = new PrismaClient();

const THROTTLE_MS = 100; // ≈ 10 req/sec
const EMPTY_ADDRESSES = ["", " ", "  ", "   "];

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--confirm");
  const retryBroken = process.argv.includes("--retry-broken");
  const limit = parseLimit();

  console.log(dryRun ? "🔍 DRY RUN" : "🔥 LIVE RUN");
  if (retryBroken) console.log("   (re-trying providers with cityId=null)");
  if (limit) console.log(`   (limit: ${limit})`);
  console.log("");

  const providers = await prisma.provider.findMany({
    where: {
      isPublished: true,
      address: { notIn: EMPTY_ADDRESSES },
      ...(retryBroken ? {} : { cityId: null }),
    },
    select: { id: true, name: true, address: true, cityId: true },
    take: limit ?? undefined,
    orderBy: { createdAt: "asc" },
  });

  console.log(`Candidates: ${providers.length}`);

  let okCount = 0;
  let createdCount = 0;
  let failedCount = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const [index, provider] of providers.entries()) {
    process.stdout.write(`  [${index + 1}/${providers.length}] ${provider.name}... `);

    const detection = await detectCityFromAddress(provider.address);

    if (!detection.ok) {
      failedCount += 1;
      failures.push({ id: provider.id, reason: detection.reason });
      console.log(`SKIP (${detection.reason})`);
    } else {
      okCount += 1;
      if (detection.wasCreated) createdCount += 1;
      console.log(`OK → ${detection.cityName}${detection.wasCreated ? " (auto-created)" : ""}`);

      if (!dryRun) {
        await prisma.provider.update({
          where: { id: provider.id },
          data: {
            cityId: detection.cityId,
            geoLat: detection.geoLat,
            geoLng: detection.geoLng,
          },
        });
      }
    }

    if (index < providers.length - 1) await sleep(THROTTLE_MS);
  }

  console.log("");
  console.log(`✓ Resolved: ${okCount} (${createdCount} new cities created)`);
  console.log(`✗ Failed:   ${failedCount}`);
  if (failures.length > 0 && failures.length <= 20) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f.id}: ${f.reason}`);
  }

  if (dryRun && okCount > 0) {
    console.log("");
    console.log("⚠️  DRY RUN — no DB writes. Re-run with --confirm to apply.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
