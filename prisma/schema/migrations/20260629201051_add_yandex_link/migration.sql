-- CreateTable
CREATE TABLE "YandexLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yandexUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YandexLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YandexLink_userId_key" ON "YandexLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "YandexLink_yandexUserId_key" ON "YandexLink"("yandexUserId");

-- AddForeignKey
ALTER TABLE "YandexLink" ADD CONSTRAINT "YandexLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
