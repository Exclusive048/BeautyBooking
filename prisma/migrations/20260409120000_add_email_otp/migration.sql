-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('PHONE', 'EMAIL');

-- AlterTable: make phone nullable, add email and channel
ALTER TABLE "OtpCode" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "OtpCode" ADD COLUMN "email" TEXT;
ALTER TABLE "OtpCode" ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'PHONE';

-- CreateIndex
CREATE INDEX "OtpCode_email_idx" ON "OtpCode"("email");
