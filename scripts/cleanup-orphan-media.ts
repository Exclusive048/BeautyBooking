import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RESULTS_PATH = resolve(process.cwd(), "media-audit-results.csv");

const CONFIRM_FLAG = "--confirm";

type Row = { id: string; status: string };

function parseCsv(csv: string): Row[] {
  const lines = csv.split("\n").slice(1).filter(Boolean);
  return lines
    .map((line) => {
      // Header columns: id,storageKey,entityType,entityId,kind,status,httpCode,createdAt
      const [id, , , , , status] = line.split(",");
      return { id: id ?? "", status: status ?? "" };
    })
    .filter((row) => row.id.length > 0);
}

function pad(n: number): string {
  return String(n).padStart(4, " ");
}

async function main() {
  if (!existsSync(RESULTS_PATH)) {
    console.error(`Audit results not found: ${RESULTS_PATH}`);
    console.error("Run `npm run media:audit` first.");
    process.exit(1);
  }

  const csv = readFileSync(RESULTS_PATH, "utf-8");
  const rows = parseCsv(csv);
  const orphans = rows.filter((r) => r.status === "MISSING_404").map((r) => r.id);

  if (orphans.length === 0) {
    console.log("✓ No MISSING_404 orphans to clean up.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${orphans.length} orphan MediaAsset records (status=MISSING_404).`);
  console.log("\nScanning references...");

  // String-URL pattern stored in DB: `/api/media/file/{id}`
  const urlPatterns = orphans.map((id) => `/api/media/file/${id}`);

  // 1. PortfolioItem.mediaUrl — exact equality (cuid is unique enough)
  const portfolioCount = await prisma.portfolioItem.count({
    where: { mediaUrl: { in: urlPatterns } },
  });

  // 2. Provider.avatarUrl
  const providerAvatarCount = await prisma.provider.count({
    where: { avatarUrl: { in: urlPatterns } },
  });

  // 3. ClientCardPhoto FK (cascade-delete on hard delete; for soft-delete we hard-delete the row)
  const clientCardPhotoCount = await prisma.clientCardPhoto.count({
    where: { mediaAssetId: { in: orphans } },
  });

  // 4. MediaAssetEmbedding (visual-search index) — hard-delete
  const embeddingCount = await prisma.mediaAssetEmbedding.count({
    where: { assetId: { in: orphans } },
  });

  console.log("\n=== DRY RUN — would change ===");
  console.log(`  PortfolioItem (delete):                  ${pad(portfolioCount)}`);
  console.log(`  Provider.avatarUrl (set null):           ${pad(providerAvatarCount)}`);
  console.log(`  ClientCardPhoto (delete):                ${pad(clientCardPhotoCount)}`);
  console.log(`  MediaAssetEmbedding (delete):            ${pad(embeddingCount)}`);
  console.log(`  MediaAsset (soft-delete to BROKEN):      ${pad(orphans.length)}`);
  console.log("");

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.log(`⚠️  DRY RUN. To actually apply, re-run with the ${CONFIRM_FLAG} flag.`);
    console.log("   Soft-delete: MediaAsset rows get deletedAt set + status=BROKEN.");
    console.log("   Hard-delete: PortfolioItem, ClientCardPhoto, MediaAssetEmbedding rows are removed.");
    await prisma.$disconnect();
    return;
  }

  console.log("🔥 Applying cleanup in a transaction...");

  const result = await prisma.$transaction(async (tx) => {
    const portfolio = await tx.portfolioItem.deleteMany({
      where: { mediaUrl: { in: urlPatterns } },
    });
    const providers = await tx.provider.updateMany({
      where: { avatarUrl: { in: urlPatterns } },
      data: { avatarUrl: null },
    });
    const clientPhotos = await tx.clientCardPhoto.deleteMany({
      where: { mediaAssetId: { in: orphans } },
    });
    const embeddings = await tx.mediaAssetEmbedding.deleteMany({
      where: { assetId: { in: orphans } },
    });
    const assets = await tx.mediaAsset.updateMany({
      where: { id: { in: orphans }, deletedAt: null },
      data: { deletedAt: new Date(), status: "BROKEN" },
    });
    return {
      portfolio: portfolio.count,
      providers: providers.count,
      clientPhotos: clientPhotos.count,
      embeddings: embeddings.count,
      assets: assets.count,
    };
  });

  console.log("\n=== Applied ===");
  console.log(`  PortfolioItem deleted:                    ${pad(result.portfolio)}`);
  console.log(`  Provider.avatarUrl nulled:                ${pad(result.providers)}`);
  console.log(`  ClientCardPhoto deleted:                  ${pad(result.clientPhotos)}`);
  console.log(`  MediaAssetEmbedding deleted:              ${pad(result.embeddings)}`);
  console.log(`  MediaAsset soft-deleted (BROKEN):         ${pad(result.assets)}`);
  console.log("\n✅ Cleanup complete.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
