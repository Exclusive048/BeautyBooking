/**
 * CATALOG-AVAILABLE-TODAY — Phase 2 verify script (one-shot).
 *
 * Runs the recompute sweep and prints, per published provider, its computed
 * availableToday + whether it changed this run — for live verification.
 *
 *   node --env-file=.env --import tsx scripts/recompute-available-today.mts
 */
const SELECT = {
  id: true,
  name: true,
  type: true,
  availableToday: true,
} as const;

async function main() {
  // Dynamic import — robust CJS/ESM interop for the tsx loader from a .mts
  // entry (top-level named imports of transpiled .ts deps fail to link).
  const { prisma } = await import("@/lib/prisma");
  const { recomputeAvailableToday } = await import(
    "@/lib/schedule/recompute-available-today"
  );

  const before = await prisma.provider.findMany({
    where: { isPublished: true },
    select: SELECT,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const wasFree = new Map(before.map((p) => [p.id, p.availableToday]));

  const summary = await recomputeAvailableToday();

  const after = await prisma.provider.findMany({
    where: { isPublished: true },
    select: SELECT,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  console.log("=== availableToday recompute ===");
  for (const p of after) {
    const changed = wasFree.get(p.id) !== p.availableToday;
    const mark = p.availableToday ? "FREE" : "busy";
    console.log(
      `  [${mark}] ${p.type.padEnd(6)} ${changed ? "*changed*" : "         "} ${p.name}`,
    );
  }
  console.log(`summary: ${JSON.stringify(summary)}`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
