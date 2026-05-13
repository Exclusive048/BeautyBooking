-- CreateTable
CREATE TABLE "MrrSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "mrrKopeks" BIGINT NOT NULL,
    "activeSubscriptionsCount" INTEGER NOT NULL,
    "breakdownJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrrSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MrrSnapshot_snapshotDate_key" ON "MrrSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "MrrSnapshot_snapshotDate_idx" ON "MrrSnapshot"("snapshotDate" DESC);
