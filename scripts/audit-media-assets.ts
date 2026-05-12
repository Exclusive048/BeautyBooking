import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL;
if (!S3_PUBLIC_URL) {
  console.error("S3_PUBLIC_URL is not set in environment.");
  process.exit(1);
}

type AuditStatus = "OK" | "MISSING_404" | "FORBIDDEN_403" | "ERROR_5XX" | "ERROR_NET";

type AuditResult = {
  id: string;
  storageKey: string;
  entityType: string;
  entityId: string;
  kind: string;
  status: AuditStatus;
  httpCode: number | null;
  createdAt: string;
};

const CONCURRENCY = 10;
const RESULTS_PATH = resolve(process.cwd(), "media-audit-results.csv");

async function checkOne(asset: { storageKey: string }): Promise<{
  status: AuditStatus;
  httpCode: number | null;
}> {
  const url = `${S3_PUBLIC_URL}/${asset.storageKey}`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (res.status === 200) return { status: "OK", httpCode: 200 };
    if (res.status === 404) return { status: "MISSING_404", httpCode: 404 };
    if (res.status === 403) return { status: "FORBIDDEN_403", httpCode: 403 };
    if (res.status >= 500) return { status: "ERROR_5XX", httpCode: res.status };
    return { status: "ERROR_NET", httpCode: res.status };
  } catch {
    return { status: "ERROR_NET", httpCode: null };
  }
}

async function processBatch<T, R>(
  items: T[],
  handler: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(handler));
    results.push(...batchResults);
    process.stdout.write(`\r  Checked ${results.length}/${items.length}`);
  }
  process.stdout.write("\n");
  return results;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  console.log("Loading MediaAsset records (status=READY, not deleted)...");
  const assets = await prisma.mediaAsset.findMany({
    where: { status: "READY", deletedAt: null },
    select: {
      id: true,
      storageKey: true,
      entityType: true,
      entityId: true,
      kind: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  Total: ${assets.length}`);

  if (assets.length === 0) {
    console.log("Nothing to audit.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nChecking S3 (concurrency: ${CONCURRENCY})...`);
  const results = await processBatch<typeof assets[number], AuditResult>(
    assets,
    async (asset) => {
      const check = await checkOne(asset);
      return {
        id: asset.id,
        storageKey: asset.storageKey,
        entityType: String(asset.entityType),
        entityId: asset.entityId,
        kind: String(asset.kind),
        status: check.status,
        httpCode: check.httpCode,
        createdAt: asset.createdAt.toISOString(),
      };
    },
    CONCURRENCY,
  );

  const stats = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n=== Audit Summary ===");
  for (const [status, count] of Object.entries(stats).sort()) {
    console.log(`  ${status.padEnd(16)} ${count}`);
  }

  const header = "id,storageKey,entityType,entityId,kind,status,httpCode,createdAt\n";
  const rows = results
    .map((r) =>
      [
        csvCell(r.id),
        csvCell(r.storageKey),
        csvCell(r.entityType),
        csvCell(r.entityId),
        csvCell(r.kind),
        csvCell(r.status),
        csvCell(r.httpCode),
        csvCell(r.createdAt),
      ].join(","),
    )
    .join("\n");
  writeFileSync(RESULTS_PATH, header + rows + "\n");
  console.log(`\nResults written to: ${RESULTS_PATH}`);

  const orphans = results.filter((r) => r.status === "MISSING_404");
  if (orphans.length > 0) {
    orphans.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    console.log("\n=== Orphans timeline ===");
    console.log(`  Earliest orphan: ${orphans[0]!.createdAt}`);
    console.log(`  Latest orphan:   ${orphans[orphans.length - 1]!.createdAt}`);
    console.log(`  Total orphans:   ${orphans.length}`);

    const byKind = orphans.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {});
    console.log("\n  By kind:");
    for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${kind.padEnd(20)} ${count}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
