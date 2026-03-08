import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function hasColumn(columnName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'GlobalCategory' AND column_name = '${columnName}' LIMIT 1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const hasValidated = await hasColumn("isValidated");
  const hasRejected = await hasColumn("isRejected");
  const hasActive = await hasColumn("isActive");

  if (hasValidated || hasRejected || hasActive) {
    const rejectedExpr = hasRejected ? 'COALESCE("isRejected", FALSE)' : "FALSE";
    const validatedExpr = hasValidated ? 'COALESCE("isValidated", FALSE)' : "FALSE";
    const activeExpr = hasActive ? 'COALESCE("isActive", TRUE)' : "TRUE";

    await prisma.$executeRawUnsafe(`
      UPDATE "GlobalCategory"
      SET "status" = CASE
        WHEN ${rejectedExpr} THEN 'REJECTED'::"CategoryStatus"
        WHEN ${validatedExpr} AND ${activeExpr} THEN 'APPROVED'::"CategoryStatus"
        ELSE 'APPROVED'::"CategoryStatus"
      END
    `);
    console.log("Updated GlobalCategory.status from legacy moderation booleans.");
    return;
  }

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "GlobalCategory"
    SET "status" = 'APPROVED'::"CategoryStatus"
    WHERE "status" = 'PENDING'::"CategoryStatus" AND "proposedBy" IS NULL
  `);

  console.log(`Legacy boolean columns not found; normalized ${updated} pending admin categories to APPROVED.`);
}

main()
  .catch((error) => {
    console.error("Failed to migrate category statuses:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
