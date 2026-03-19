CREATE TABLE "ScheduleChangeRequestArchive" (
    "id" TEXT NOT NULL,
    "sourceRequestId" TEXT NOT NULL,
    "studioId" TEXT,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "finalStatus" "ScheduleChangeRequestStatus" NOT NULL,
    "statusHistoryJson" JSONB NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "comment" TEXT,
    "sourceSnapshotJson" JSONB,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleChangeRequestArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleChangeRequestArchive_sourceRequestId_key" ON "ScheduleChangeRequestArchive"("sourceRequestId");
CREATE INDEX "ScheduleChangeRequestArchive_studioId_finalizedAt_idx" ON "ScheduleChangeRequestArchive"("studioId", "finalizedAt");
CREATE INDEX "ScheduleChangeRequestArchive_studioId_finalStatus_finalizedAt_idx" ON "ScheduleChangeRequestArchive"("studioId", "finalStatus", "finalizedAt");
CREATE INDEX "ScheduleChangeRequestArchive_archivedAt_idx" ON "ScheduleChangeRequestArchive"("archivedAt");
