-- CreateEnum
CREATE TYPE "ReviewReportReason" AS ENUM ('SPAM', 'FAKE', 'OFFENSIVE', 'INAPPROPRIATE', 'OTHER');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "reportReason" "ReviewReportReason";
