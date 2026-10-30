-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAuditAction" ADD VALUE 'CATEGORY_CREATED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'HOT_SLOTS_RUN';
ALTER TYPE "AdminAuditAction" ADD VALUE 'MEDIA_CLEANUP_RUN';
ALTER TYPE "AdminAuditAction" ADD VALUE 'QUEUE_JOB_RETRIED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'QUEUE_JOB_DELETED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'VISUAL_SEARCH_REINDEX_REQUESTED';
