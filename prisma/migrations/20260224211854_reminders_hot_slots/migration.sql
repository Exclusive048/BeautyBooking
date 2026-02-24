-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('CLIENT', 'MASTER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REMINDER_24H';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REMINDER_2H';
ALTER TYPE "NotificationType" ADD VALUE 'HOT_SLOT_AVAILABLE';
ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MESSAGE_RECEIVED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reminder24hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder2hSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClientCard" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "cancellationDeadlineHours" INTEGER,
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "HotSlotSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotSlotSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingChat" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotSlotSubscription_providerId_idx" ON "HotSlotSubscription"("providerId");

-- CreateIndex
CREATE INDEX "HotSlotSubscription_userId_idx" ON "HotSlotSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HotSlotSubscription_userId_providerId_key" ON "HotSlotSubscription"("userId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingChat_bookingId_key" ON "BookingChat"("bookingId");

-- CreateIndex
CREATE INDEX "BookingChat_bookingId_idx" ON "BookingChat"("bookingId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_readAt_idx" ON "ChatMessage"("chatId", "readAt");

-- AddForeignKey
ALTER TABLE "HotSlotSubscription" ADD CONSTRAINT "HotSlotSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotSlotSubscription" ADD CONSTRAINT "HotSlotSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingChat" ADD CONSTRAINT "BookingChat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "BookingChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
