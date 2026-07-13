/**
 * Backfill: re-embed ALL portfolio assets for visual search.
 *
 * Background — VISUAL-SEARCH-YANDEX-MIGRATION-01 (F1):
 *   The embedding dimension changed 1536 -> 256 (OpenAI -> Yandex), which
 *   invalidates every stored vector. There was NO working path to re-embed
 *   already-indexed assets: the admin reindex route only touched
 *   `visualCategory = null`, and the indexer's `getPortfolioAsset` returns null
 *   when `visualIndexed === true` — so once indexed, an asset could never be
 *   re-embedded. This script defeats both by RESETTING the guard before
 *   enqueueing, so the worker re-runs classify -> describe -> embed with the new
 *   Yandex provider and writes fresh 256-dim vectors.
 *
 * What it does (with --apply):
 *   1. Clears the stale vector rows for all PORTFOLIO assets (they were 1536-dim
 *      and are structurally invalid after the migration).
 *   2. Resets `visualIndexed=false` + clears visualCategory/Description/Meta/
 *      PromptVersion/IndexedAt on those assets, so `getPortfolioAsset` admits
 *      them again (the indexer skip-guard is satisfied).
 *   3. Enqueues a `visual_search_index` job per asset. The WORKER (npm run worker)
 *      must be running and Redis reachable for the jobs to actually process;
 *      this script only resets + enqueues.
 *
 * Idempotent: safe to re-run (it just resets + re-enqueues again).
 *
 * PRECONDITIONS: the vector(256) migration must be applied (prisma migrate
 * deploy) and VISUAL_SEARCH_ENABLED + YANDEX_API_KEY/YANDEX_FOLDER_ID must be set,
 * or the worker will skip/fail the jobs.
 *
 * USAGE (env must be loaded — pass --env-file so queue/env see REDIS_URL etc.):
 *   node --env-file=.env --import tsx scripts/backfill-visual-embeddings.mts             # DRY RUN
 *   node --env-file=.env --import tsx scripts/backfill-visual-embeddings.mts --apply     # execute
 */
const ENQUEUE_PAGE = 500;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(
    apply ? "MODE: APPLY (resetting + enqueueing)" : "MODE: DRY RUN (no writes; pass --apply)"
  );

  // Dynamic import — robust CJS/ESM interop for the tsx loader from a .mts entry.
  const { prisma } = await import("@/lib/prisma");
  const { MediaKind, Prisma } = await import("@prisma/client");
  const { enqueue } = await import("@/lib/queue/queue");
  const { createVisualSearchIndexJob } = await import("@/lib/queue/types");

  const portfolioWhere = { kind: MediaKind.PORTFOLIO, deletedAt: null } as const;

  const total = await prisma.mediaAsset.count({ where: portfolioWhere });
  const alreadyIndexed = await prisma.mediaAsset.count({
    where: { ...portfolioWhere, visualIndexed: true },
  });
  const existingVectors = await prisma.mediaAssetEmbedding.count({
    where: { asset: portfolioWhere },
  });

  console.log(
    [
      `Portfolio assets (not deleted): ${total}`,
      `  currently visualIndexed=true:  ${alreadyIndexed}`,
      `  existing embedding rows:       ${existingVectors}  (deleted on --apply — stale dimension)`,
    ].join("\n")
  );

  if (total === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  if (!apply) {
    console.log(
      `\nDRY RUN — would reset ${total} asset(s), delete ${existingVectors} stale vector(s), ` +
        `and enqueue ${total} visual_search_index job(s). Re-run with --apply to execute.`
    );
    return;
  }

  // 1 + 2: drop stale vectors and reset the guard, atomically.
  await prisma.$transaction(async (tx) => {
    await tx.mediaAssetEmbedding.deleteMany({ where: { asset: portfolioWhere } });
    await tx.mediaAsset.updateMany({
      where: portfolioWhere,
      data: {
        visualIndexed: false,
        visualIndexedAt: null,
        visualPromptVersion: null,
        visualDescription: null,
        visualMeta: Prisma.DbNull,
        visualCategory: null,
      },
    });
  });
  console.log(`Reset ${total} asset(s) and cleared ${existingVectors} stale vector row(s).`);

  // 3: enqueue in pages (keeps memory bounded on large portfolios).
  let enqueued = 0;
  let cursor: string | null = null;
  for (;;) {
    const page: Array<{ id: string }> = await prisma.mediaAsset.findMany({
      where: portfolioWhere,
      select: { id: true },
      orderBy: { id: "asc" },
      take: ENQUEUE_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    await Promise.all(page.map((a) => enqueue(createVisualSearchIndexJob({ assetId: a.id }))));
    enqueued += page.length;
    cursor = page[page.length - 1]!.id;
    console.log(`  enqueued ${enqueued}/${total}...`);
  }

  console.log(
    `\nDone. Enqueued ${enqueued} visual_search_index job(s). ` +
      `Ensure the worker (npm run worker) is running to process them.`
  );
}

main().catch((error) => {
  console.error("backfill-visual-embeddings failed:", error);
  process.exit(1);
});
