-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION-SQUASH-01 — объединённый baseline (36 миграций → 1 файл)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ЧТО ЭТО. Дословная конкатенация всех 36 миграций проекта в исходном
-- порядке применения. Ни один statement не изменён, не переставлен и не удалён:
-- `prisma migrate deploy` выполняет файлы в лексикографическом порядке имён
-- каталогов и внутри файла — по порядку, поэтому конкатенация в том же порядке
-- даёт ТУ ЖЕ последовательность операций. Отличий ровно два, и оба безвредны на
-- пустой базе: границы транзакций (было 36, стало 1 — строго безопаснее,
-- всё-или-ничего) и число строк в `_prisma_migrations` (было 36, стало 1).
--
-- ПОЧЕМУ КОНКАТЕНАЦИЯ, А НЕ ПЕРЕГЕНЕРАЦИЯ ЧИСТОГО init. Восемь объектов БД
-- существуют ТОЛЬКО в сыром SQL (реестр — scripts/raw-sql-objects.mjs): HNSW-индекс
-- pgvector, три частичных индекса и четыре CHECK-констрейнта. `prisma migrate diff`
-- CHECK-констрейнты **игнорирует вовсе** (замерено, MASTERRYADOM_AI_CONTEXT.md §4),
-- то есть перегенерация потеряла бы их МОЛЧА. Конкатенация теряет их не может по
-- построению — она ничего не выводит, она копирует.
--
-- ПОЧЕМУ ЭТО БЕЗОПАСНО СЕЙЧАС. Прод-БД ещё не существует (DEPLOY-BACKLOG.md §2:
-- «на прод-БД, которой ещё не существует, применятся ВСЕ 36»). Сквош
-- переписывает историю миграций — это допустимо ровно до первого боевого
-- `migrate deploy`, и недопустимо после.
--
-- ⚠️ СУЩЕСТВУЮЩИЕ БАЗЫ (dev/локальные) после сквоша обязаны быть пересозданы:
-- в их `_prisma_migrations` лежат 36 записей об именах, которых больше нет на
-- диске, и `migrate deploy`/`migrate dev` сообщат о рассинхроне. Порядок для dev:
-- `npm run seed:test:reset` → `npx prisma migrate deploy` → `npm run seed:test`.
--
-- ИСТОРИЯ. Оригинальные 36 файлов остаются в git и читаются как обычно:
--   git show 16428ceb:prisma/schema/migrations/<имя>/migration.sql
--   git log --diff-filter=D -- prisma/schema/migrations/
-- Разделители ниже сохраняют имя и порядковый номер каждой исходной миграции, а
-- все авторские комментарии перенесены дословно — включая пояснения о снятых
-- вручную `DROP INDEX` (см. scripts/check-migration-drops.mjs).
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- [01/36]  20260324190000_baseline
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required extension for vector embeddings.
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('MASTER', 'STUDIO');

-- CreateEnum
CREATE TYPE "SubscriptionScope" AS ENUM ('MASTER', 'STUDIO');

-- CreateEnum
CREATE TYPE "StudioRole" AS ENUM ('OWNER', 'ADMIN', 'MASTER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PENDING', 'REJECTED', 'LEFT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CLIENT', 'MASTER', 'STUDIO', 'STUDIO_ADMIN', 'ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING', 'PUBLIC_PROFILE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('NEW', 'PENDING', 'CONFIRMED', 'CHANGE_REQUESTED', 'REJECTED', 'IN_PROGRESS', 'PREPAID', 'STARTED', 'FINISHED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('CLIENT', 'MASTER');

-- CreateEnum
CREATE TYPE "BookingCancelledBy" AS ENUM ('CLIENT', 'PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BookingRequestedBy" AS ENUM ('CLIENT', 'MASTER');

-- CreateEnum
CREATE TYPE "BookingActionRequiredBy" AS ENUM ('CLIENT', 'MASTER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "DiscountApplyMode" AS ENUM ('ALL_SERVICES', 'PRICE_FROM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScheduleBreakKind" AS ENUM ('WEEKLY', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "ScheduleOverrideKind" AS ENUM ('OFF', 'TIME_RANGE', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "ScheduleMode" AS ENUM ('FLEXIBLE', 'FIXED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CREATED', 'BOOKING_CANCELLED', 'BOOKING_CANCELLED_BY_MASTER', 'BOOKING_CANCELLED_BY_CLIENT', 'BOOKING_RESCHEDULED', 'BOOKING_RESCHEDULE_REQUESTED', 'BOOKING_REQUEST', 'BOOKING_CONFIRMED', 'BOOKING_DECLINED', 'BOOKING_REJECTED', 'BOOKING_REMINDER_24H', 'BOOKING_REMINDER_2H', 'BOOKING_COMPLETED_REVIEW', 'BOOKING_NO_SHOW', 'REVIEW_LEFT', 'REVIEW_REPLIED', 'STUDIO_INVITE_RECEIVED', 'STUDIO_INVITE_ACCEPTED', 'STUDIO_INVITE_REJECTED', 'STUDIO_MEMBER_LEFT', 'STUDIO_SCHEDULE_REQUEST', 'STUDIO_SCHEDULE_APPROVED', 'STUDIO_SCHEDULE_REJECTED', 'STUDIO_DISBANDED', 'MASTER_CABINET_DELETED', 'MODEL_NEW_APPLICATION', 'MODEL_APPLICATION_RECEIVED', 'MODEL_APPLICATION_REJECTED', 'MODEL_TIME_PROPOSED', 'MODEL_BOOKING_CREATED', 'MODEL_TIME_CONFIRMED', 'HOT_SLOT_AVAILABLE', 'HOT_SLOT_PUBLISHED', 'HOT_SLOT_BOOKED', 'HOT_SLOT_EXPIRING', 'BILLING_PAYMENT_SUCCEEDED', 'BILLING_PAYMENT_FAILED', 'BILLING_RENEWAL_CONFIRMATION_REQUIRED', 'BILLING_SUBSCRIPTION_CANCELLED', 'BILLING_SUBSCRIPTION_EXPIRED', 'CHAT_MESSAGE_RECEIVED', 'CATEGORY_APPROVED', 'CATEGORY_REJECTED');

-- CreateEnum
CREATE TYPE "MediaEntityType" AS ENUM ('USER', 'MASTER', 'STUDIO', 'SITE', 'MODEL_APPLICATION', 'CLIENT_CARD', 'BOOKING');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AVATAR', 'PORTFOLIO', 'MODEL_APPLICATION_PHOTO', 'CLIENT_CARD_PHOTO', 'BOOKING_REFERENCE');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'BROKEN');

-- CreateEnum
CREATE TYPE "StudioMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MASTER', 'FINANCE');

-- CreateEnum
CREATE TYPE "StudioMemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('MANUAL', 'WEB', 'APP');

-- CreateEnum
CREATE TYPE "TimeBlockType" AS ENUM ('BREAK', 'BLOCK');

-- CreateEnum
CREATE TYPE "ScheduleChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('provider', 'studio');

-- CreateEnum
CREATE TYPE "ReviewTagType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ModelOfferStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModelApplicationStatus" AS ENUM ('PENDING', 'REJECTED', 'APPROVED_WAITING_CLIENT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "roles" "AccountType"[] DEFAULT ARRAY['CLIENT']::"AccountType"[],
    "displayName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "externalPhotoUrl" TEXT,
    "avatarFocalX" DOUBLE PRECISION,
    "avatarFocalY" DOUBLE PRECISION,
    "firstName" TEXT,
    "lastName" TEXT,
    "middleName" TEXT,
    "birthDate" TIMESTAMP(3),
    "address" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "publicUsername" TEXT,
    "publicUsernameUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Studio" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "lastBookingsSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "roles" "StudioRole"[],
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioInvite" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "rotatedToSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "priceFrom" INTEGER NOT NULL DEFAULT 0,
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableToday" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "bufferBetweenBookingsMin" INTEGER NOT NULL DEFAULT 0,
    "autoConfirmBookings" BOOLEAN NOT NULL DEFAULT false,
    "cancellationDeadlineHours" INTEGER,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE',
    "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "studioId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "avatarFocalX" DOUBLE PRECISION,
    "avatarFocalY" DOUBLE PRECISION,
    "bannerFocalX" DOUBLE PRECISION,
    "bannerFocalY" DOUBLE PRECISION,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publicUsername" TEXT,
    "publicUsernameUpdatedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicUsernameAlias" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "providerId" TEXT,
    "clientUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicUsernameAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCard" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT,
    "clientPhone" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCardPhoto" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCardPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "studioId" TEXT,
    "categoryId" TEXT,
    "globalCategoryId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "baseDurationMin" INTEGER,
    "basePrice" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requiresReferencePhoto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingQuestion" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceBookingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterService" (
    "id" TEXT NOT NULL,
    "masterProviderId" TEXT NOT NULL,
    "studioId" TEXT,
    "masterId" TEXT,
    "serviceId" TEXT NOT NULL,
    "priceOverride" INTEGER,
    "durationOverrideMin" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commissionPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "triggerHours" INTEGER NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "applyMode" "DiscountApplyMode" NOT NULL,
    "minPriceFrom" INTEGER,
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotSlot" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT,
    "startAtUtc" TIMESTAMP(3) NOT NULL,
    "endAtUtc" TIMESTAMP(3) NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAtUtc" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotSlotSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotSlotSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "masterProviderId" TEXT,
    "clientUserId" TEXT,
    "startAtUtc" TIMESTAMP(3),
    "endAtUtc" TIMESTAMP(3),
    "studioId" TEXT,
    "masterId" TEXT,
    "clientId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "slotLabel" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientNameSnapshot" TEXT,
    "clientPhoneSnapshot" TEXT,
    "comment" TEXT,
    "source" "BookingSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "silentMode" BOOLEAN NOT NULL DEFAULT false,
    "referencePhotoAssetId" TEXT,
    "bookingAnswers" JSONB,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledBy" "BookingCancelledBy",
    "cancelReason" TEXT,
    "cancelledAtUtc" TIMESTAMP(3),
    "proposedStartAt" TIMESTAMP(3),
    "proposedEndAt" TIMESTAMP(3),
    "requestedBy" "BookingRequestedBy",
    "changeComment" TEXT,
    "actionRequiredBy" "BookingActionRequiredBy",
    "clientChangeRequestsCount" INTEGER NOT NULL DEFAULT 0,
    "masterChangeRequestsCount" INTEGER NOT NULL DEFAULT 0,
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder2hSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "bookingId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "ScheduleOverrideKind" NOT NULL DEFAULT 'TIME_RANGE',
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "isWorkday" BOOLEAN,
    "scheduleMode" "ScheduleMode",
    "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startLocal" TEXT,
    "endLocal" TEXT,
    "templateId" TEXT,
    "isActive" BOOLEAN,
    "note" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBreak" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" "ScheduleBreakKind" NOT NULL,
    "dayOfWeek" INTEGER,
    "date" TIMESTAMP(3),
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTemplateBreak" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduleTemplateBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScheduleConfig" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyScheduleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScheduleDay" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "templateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'FLEXIBLE',
    "fixedSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "WeeklyScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "chatId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vkUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VkLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "entityType" "MediaEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "focalX" DOUBLE PRECISION,
    "focalY" DOUBLE PRECISION,
    "visualIndexed" BOOLEAN NOT NULL DEFAULT false,
    "visualIndexedAt" TIMESTAMP(3),
    "visualPromptVersion" TEXT,
    "visualDescription" TEXT,
    "visualMeta" JSONB,
    "visualCategory" TEXT,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'READY',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset_embeddings" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "embedding" public.vector(1536) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelOffer" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "masterServiceId" TEXT,
    "serviceId" TEXT,
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dateLocal" TEXT NOT NULL,
    "timeRangeStartLocal" TEXT NOT NULL,
    "timeRangeEndLocal" TEXT NOT NULL,
    "price" DECIMAL(65,30),
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraBusyMin" INTEGER NOT NULL DEFAULT 0,
    "status" "ModelOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelApplication" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "status" "ModelApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "clientNote" TEXT,
    "consentToShoot" BOOLEAN NOT NULL,
    "proposedTimeLocal" TEXT,
    "confirmedStartAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "authorId" TEXT NOT NULL,
    "studioId" TEXT,
    "masterId" TEXT,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "reportComment" TEXT,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTag" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "type" "ReviewTagType" NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTagOnReview" (
    "reviewId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTagOnReview_pkey" PRIMARY KEY ("reviewId","tagId")
);

-- CreateTable
CREATE TABLE "StudioMember" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StudioMemberRole" NOT NULL,
    "status" "StudioMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "parent_id" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "status" "CategoryStatus" NOT NULL DEFAULT 'PENDING',
    "proposedBy" TEXT,
    "proposedAt" TIMESTAMP(3),
    "context" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "visibleToAll" BOOLEAN NOT NULL DEFAULT true,
    "visualSearchSlug" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdByProviderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "relatedCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "scope" "SubscriptionScope" NOT NULL DEFAULT 'MASTER',
    "features" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "inheritsFromPlanId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "periodMonths" INTEGER NOT NULL,
    "priceKopeks" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BillingPlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "scope" "SubscriptionScope" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "periodMonths" INTEGER NOT NULL DEFAULT 1,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "paymentMethodId" TEXT,
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL,
    "amountKopeks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "periodMonths" INTEGER NOT NULL,
    "yookassaPaymentId" TEXT,
    "confirmationUrl" TEXT,
    "idempotenceKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "SubscriptionScope",
    "subscriptionId" TEXT,
    "paymentId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingServiceItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "studioId" TEXT,
    "serviceId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "durationSnapshotMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "studioId" TEXT,
    "masterId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "type" "TimeBlockType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleChangeRequest" (
    "id" TEXT NOT NULL,
    "studioId" TEXT,
    "providerId" TEXT NOT NULL,
    "comment" TEXT,
    "payloadJson" JSONB NOT NULL,
    "status" "ScheduleChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "studioId" TEXT,
    "masterId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "caption" TEXT,
    "global_category_id" TEXT,
    "categorySource" TEXT,
    "inSearch" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItemService" (
    "portfolioItemId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItemService_pkey" PRIMARY KEY ("portfolioItemId","serviceId")
);

-- CreateTable
CREATE TABLE "PortfolioItemTag" (
    "portfolioItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItemTag_pkey" PRIMARY KEY ("portfolioItemId","tagId")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_phone_key" ON "UserProfile"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_telegramId_key" ON "UserProfile"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_publicUsername_key" ON "UserProfile"("publicUsername");

-- CreateIndex
CREATE INDEX "UserConsent_userId_idx" ON "UserConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserConsent_userId_consentType_key" ON "UserConsent"("userId", "consentType");

-- CreateIndex
CREATE UNIQUE INDEX "Studio_providerId_key" ON "Studio"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_userId_key" ON "MasterProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterProfile_providerId_key" ON "MasterProfile"("providerId");

-- CreateIndex
CREATE INDEX "StudioMembership_userId_idx" ON "StudioMembership"("userId");

-- CreateIndex
CREATE INDEX "StudioMembership_studioId_idx" ON "StudioMembership"("studioId");

-- CreateIndex
CREATE INDEX "StudioMembership_status_idx" ON "StudioMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMembership_userId_studioId_key" ON "StudioMembership"("userId", "studioId");

-- CreateIndex
CREATE INDEX "StudioInvite_studioId_idx" ON "StudioInvite"("studioId");

-- CreateIndex
CREATE INDEX "StudioInvite_phone_idx" ON "StudioInvite"("phone");

-- CreateIndex
CREATE INDEX "StudioInvite_status_idx" ON "StudioInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioInvite_studioId_phone_key" ON "StudioInvite"("studioId", "phone");

-- CreateIndex
CREATE INDEX "OtpCode_phone_idx" ON "OtpCode"("phone");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_jti_key" ON "RefreshSession"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_rotatedToSessionId_key" ON "RefreshSession"("rotatedToSessionId");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshSession_revokedAt_idx" ON "RefreshSession"("revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_usedAt_idx" ON "RefreshSession"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_publicUsername_key" ON "Provider"("publicUsername");

-- CreateIndex
CREATE INDEX "Provider_ownerUserId_idx" ON "Provider"("ownerUserId");

-- CreateIndex
CREATE INDEX "Provider_studioId_idx" ON "Provider"("studioId");

-- CreateIndex
CREATE INDEX "Provider_isPublished_rating_reviews_idx" ON "Provider"("isPublished", "rating" DESC, "reviews" DESC);

-- CreateIndex
CREATE INDEX "Provider_isPublished_ratingAvg_reviews_createdAt_idx" ON "Provider"("isPublished", "ratingAvg" DESC, "reviews" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Provider_studioId_type_isPublished_createdAt_idx" ON "Provider"("studioId", "type", "isPublished", "createdAt");

-- CreateIndex
CREATE INDEX "Provider_type_isPublished_address_idx" ON "Provider"("type", "isPublished", "address");

-- CreateIndex
CREATE UNIQUE INDEX "PublicUsernameAlias_username_key" ON "PublicUsernameAlias"("username");

-- CreateIndex
CREATE INDEX "PublicUsernameAlias_providerId_idx" ON "PublicUsernameAlias"("providerId");

-- CreateIndex
CREATE INDEX "PublicUsernameAlias_clientUserId_idx" ON "PublicUsernameAlias"("clientUserId");

-- CreateIndex
CREATE INDEX "ClientCard_providerId_idx" ON "ClientCard"("providerId");

-- CreateIndex
CREATE INDEX "ClientCard_providerId_clientUserId_idx" ON "ClientCard"("providerId", "clientUserId");

-- CreateIndex
CREATE INDEX "ClientCard_providerId_clientPhone_idx" ON "ClientCard"("providerId", "clientPhone");

-- CreateIndex
CREATE INDEX "ClientCard_clientUserId_idx" ON "ClientCard"("clientUserId");

-- CreateIndex
CREATE INDEX "ClientCard_clientPhone_idx" ON "ClientCard"("clientPhone");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCardPhoto_mediaAssetId_key" ON "ClientCardPhoto"("mediaAssetId");

-- CreateIndex
CREATE INDEX "ClientCardPhoto_cardId_idx" ON "ClientCardPhoto"("cardId");

-- CreateIndex
CREATE INDEX "Service_providerId_idx" ON "Service"("providerId");

-- CreateIndex
CREATE INDEX "Service_providerId_isEnabled_isActive_idx" ON "Service"("providerId", "isEnabled", "isActive");

-- CreateIndex
CREATE INDEX "Service_globalCategoryId_isEnabled_isActive_idx" ON "Service"("globalCategoryId", "isEnabled", "isActive");

-- CreateIndex
CREATE INDEX "ServiceBookingQuestion_serviceId_idx" ON "ServiceBookingQuestion"("serviceId");

-- CreateIndex
CREATE INDEX "MasterService_masterProviderId_idx" ON "MasterService"("masterProviderId");

-- CreateIndex
CREATE INDEX "MasterService_serviceId_idx" ON "MasterService"("serviceId");

-- CreateIndex
CREATE INDEX "MasterService_masterProviderId_isEnabled_idx" ON "MasterService"("masterProviderId", "isEnabled");

-- CreateIndex
CREATE INDEX "MasterService_serviceId_isEnabled_idx" ON "MasterService"("serviceId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "MasterService_masterProviderId_serviceId_key" ON "MasterService"("masterProviderId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRule_providerId_key" ON "DiscountRule"("providerId");

-- CreateIndex
CREATE INDEX "DiscountRule_isEnabled_idx" ON "DiscountRule"("isEnabled");

-- CreateIndex
CREATE INDEX "HotSlot_providerId_startAtUtc_idx" ON "HotSlot"("providerId", "startAtUtc");

-- CreateIndex
CREATE INDEX "HotSlot_isActive_expiresAtUtc_idx" ON "HotSlot"("isActive", "expiresAtUtc");

-- CreateIndex
CREATE INDEX "HotSlot_providerId_isActive_idx" ON "HotSlot"("providerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HotSlot_providerId_startAtUtc_endAtUtc_key" ON "HotSlot"("providerId", "startAtUtc", "endAtUtc");

-- CreateIndex
CREATE INDEX "HotSlotSubscription_providerId_idx" ON "HotSlotSubscription"("providerId");

-- CreateIndex
CREATE INDEX "HotSlotSubscription_userId_idx" ON "HotSlotSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HotSlotSubscription_userId_providerId_key" ON "HotSlotSubscription"("userId", "providerId");

-- CreateIndex
CREATE INDEX "Booking_providerId_startAtUtc_endAtUtc_idx" ON "Booking"("providerId", "startAtUtc", "endAtUtc");

-- CreateIndex
CREATE INDEX "Booking_providerId_idx" ON "Booking"("providerId");

-- CreateIndex
CREATE INDEX "Booking_masterProviderId_idx" ON "Booking"("masterProviderId");

-- CreateIndex
CREATE INDEX "Booking_startAtUtc_idx" ON "Booking"("startAtUtc");

-- CreateIndex
CREATE INDEX "Booking_serviceId_idx" ON "Booking"("serviceId");

-- CreateIndex
CREATE INDEX "Booking_clientUserId_idx" ON "Booking"("clientUserId");

-- CreateIndex
CREATE INDEX "Booking_studioId_idx" ON "Booking"("studioId");

-- CreateIndex
CREATE INDEX "Booking_masterId_idx" ON "Booking"("masterId");

-- CreateIndex
CREATE INDEX "Booking_status_startAtUtc_idx" ON "Booking"("status", "startAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "BookingChat_bookingId_key" ON "BookingChat"("bookingId");

-- CreateIndex
CREATE INDEX "BookingChat_bookingId_idx" ON "BookingChat"("bookingId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatId_readAt_idx" ON "ChatMessage"("chatId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_bookingId_idx" ON "Notification"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ScheduleOverride_providerId_idx" ON "ScheduleOverride"("providerId");

-- CreateIndex
CREATE INDEX "ScheduleOverride_providerId_date_idx" ON "ScheduleOverride"("providerId", "date");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_idx" ON "ScheduleBreak"("providerId");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_kind_idx" ON "ScheduleBreak"("providerId", "kind");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_kind_dayOfWeek_idx" ON "ScheduleBreak"("providerId", "kind", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleBreak_providerId_date_idx" ON "ScheduleBreak"("providerId", "date");

-- CreateIndex
CREATE INDEX "ScheduleTemplate_providerId_idx" ON "ScheduleTemplate"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleTemplate_providerId_name_key" ON "ScheduleTemplate"("providerId", "name");

-- CreateIndex
CREATE INDEX "ScheduleTemplateBreak_templateId_idx" ON "ScheduleTemplateBreak"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScheduleConfig_providerId_key" ON "WeeklyScheduleConfig"("providerId");

-- CreateIndex
CREATE INDEX "WeeklyScheduleDay_templateId_idx" ON "WeeklyScheduleDay"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScheduleDay_configId_weekday_key" ON "WeeklyScheduleDay"("configId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_userId_key" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "VkLink_userId_key" ON "VkLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VkLink_vkUserId_key" ON "VkLink"("vkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MediaAsset_entityType_entityId_kind_deletedAt_idx" ON "MediaAsset"("entityType", "entityId", "kind", "deletedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_storageKey_idx" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_createdByUserId_idx" ON "MediaAsset"("createdByUserId");

-- CreateIndex
CREATE INDEX "MediaAsset_kind_visualIndexed_visualCategory_idx" ON "MediaAsset"("kind", "visualIndexed", "visualCategory");

-- CreateIndex
CREATE INDEX "MediaAsset_status_deletedAt_createdAt_idx" ON "MediaAsset"("status", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_embeddings_asset_id_key" ON "media_asset_embeddings"("asset_id");

-- CreateIndex
CREATE INDEX "media_asset_embeddings_asset_id_idx" ON "media_asset_embeddings"("asset_id");

-- CreateIndex
CREATE INDEX "ModelOffer_masterId_idx" ON "ModelOffer"("masterId");

-- CreateIndex
CREATE INDEX "ModelOffer_status_idx" ON "ModelOffer"("status");

-- CreateIndex
CREATE INDEX "ModelOffer_dateLocal_idx" ON "ModelOffer"("dateLocal");

-- CreateIndex
CREATE INDEX "ModelOffer_masterServiceId_idx" ON "ModelOffer"("masterServiceId");

-- CreateIndex
CREATE INDEX "ModelOffer_serviceId_idx" ON "ModelOffer"("serviceId");

-- CreateIndex
CREATE INDEX "ModelOffer_status_dateLocal_timeRangeStartLocal_createdAt_i_idx" ON "ModelOffer"("status", "dateLocal", "timeRangeStartLocal", "createdAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "ModelApplication_bookingId_key" ON "ModelApplication"("bookingId");

-- CreateIndex
CREATE INDEX "ModelApplication_offerId_idx" ON "ModelApplication"("offerId");

-- CreateIndex
CREATE INDEX "ModelApplication_status_idx" ON "ModelApplication"("status");

-- CreateIndex
CREATE INDEX "ModelApplication_clientUserId_idx" ON "ModelApplication"("clientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelApplication_offerId_clientUserId_key" ON "ModelApplication"("offerId", "clientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_targetType_targetId_idx" ON "Review"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Review_studioId_createdAt_idx" ON "Review"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_masterId_createdAt_idx" ON "Review"("masterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTag_code_key" ON "ReviewTag"("code");

-- CreateIndex
CREATE INDEX "ReviewTag_type_isActive_idx" ON "ReviewTag"("type", "isActive");

-- CreateIndex
CREATE INDEX "ReviewTagOnReview_tagId_idx" ON "ReviewTagOnReview"("tagId");

-- CreateIndex
CREATE INDEX "ReviewTagOnReview_reviewId_idx" ON "ReviewTagOnReview"("reviewId");

-- CreateIndex
CREATE INDEX "StudioMember_userId_status_idx" ON "StudioMember"("userId", "status");

-- CreateIndex
CREATE INDEX "StudioMember_studioId_status_idx" ON "StudioMember"("studioId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMember_studioId_userId_role_key" ON "StudioMember"("studioId", "userId", "role");

-- CreateIndex
CREATE INDEX "ServiceCategory_studioId_sortOrder_idx" ON "ServiceCategory"("studioId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalCategory_slug_key" ON "GlobalCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalCategory_visualSearchSlug_key" ON "GlobalCategory"("visualSearchSlug");

-- CreateIndex
CREATE INDEX "GlobalCategory_status_idx" ON "GlobalCategory"("status");

-- CreateIndex
CREATE INDEX "GlobalCategory_parent_id_orderIndex_idx" ON "GlobalCategory"("parent_id", "orderIndex");

-- CreateIndex
CREATE INDEX "GlobalCategory_isSystem_idx" ON "GlobalCategory"("isSystem");

-- CreateIndex
CREATE INDEX "GlobalCategory_visibleToAll_idx" ON "GlobalCategory"("visibleToAll");

-- CreateIndex
CREATE INDEX "GlobalCategory_createdByUserId_idx" ON "GlobalCategory"("createdByUserId");

-- CreateIndex
CREATE INDEX "GlobalCategory_createdByProviderId_idx" ON "GlobalCategory"("createdByProviderId");

-- CreateIndex
CREATE INDEX "GlobalCategory_status_visibleToAll_isSystem_name_idx" ON "GlobalCategory"("status", "visibleToAll", "isSystem", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_isFeatured_usageCount_idx" ON "Tag"("isFeatured", "usageCount");

-- CreateIndex
CREATE INDEX "Tag_relatedCategoryId_idx" ON "Tag"("relatedCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_code_key" ON "BillingPlan"("code");

-- CreateIndex
CREATE INDEX "BillingPlanPrice_periodMonths_idx" ON "BillingPlanPrice"("periodMonths");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlanPrice_planId_periodMonths_key" ON "BillingPlanPrice"("planId", "periodMonths");

-- CreateIndex
CREATE INDEX "ClientNote_clientUserId_idx" ON "ClientNote"("clientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientNote_masterId_clientUserId_key" ON "ClientNote"("masterId", "clientUserId");

-- CreateIndex
CREATE INDEX "UserSubscription_status_autoRenew_nextBillingAt_idx" ON "UserSubscription"("status", "autoRenew", "nextBillingAt");

-- CreateIndex
CREATE INDEX "UserSubscription_status_graceUntil_idx" ON "UserSubscription"("status", "graceUntil");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_scope_key" ON "UserSubscription"("userId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_yookassaPaymentId_key" ON "BillingPayment"("yookassaPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_idempotenceKey_key" ON "BillingPayment"("idempotenceKey");

-- CreateIndex
CREATE INDEX "BillingPayment_subscriptionId_status_idx" ON "BillingPayment"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "BillingPayment_status_createdAt_idx" ON "BillingPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingAuditLog_userId_createdAt_idx" ON "BillingAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingAuditLog_action_createdAt_idx" ON "BillingAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "BookingServiceItem_bookingId_idx" ON "BookingServiceItem"("bookingId");

-- CreateIndex
CREATE INDEX "BookingServiceItem_studioId_idx" ON "BookingServiceItem"("studioId");

-- CreateIndex
CREATE INDEX "BookingServiceItem_serviceId_idx" ON "BookingServiceItem"("serviceId");

-- CreateIndex
CREATE INDEX "TimeBlock_studioId_masterId_startAt_endAt_idx" ON "TimeBlock"("studioId", "masterId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_providerId_status_createdAt_idx" ON "ScheduleChangeRequest"("providerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_studioId_status_createdAt_idx" ON "ScheduleChangeRequest"("studioId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_masterId_createdAt_idx" ON "PortfolioItem"("masterId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_studioId_createdAt_idx" ON "PortfolioItem"("studioId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_global_category_id_inSearch_idx" ON "PortfolioItem"("global_category_id", "inSearch");

-- CreateIndex
CREATE INDEX "PortfolioItemService_serviceId_idx" ON "PortfolioItemService"("serviceId");

-- CreateIndex
CREATE INDEX "PortfolioItemTag_tagId_idx" ON "PortfolioItemTag"("tagId");

-- CreateIndex
CREATE INDEX "Favorite_portfolioItemId_createdAt_idx" ON "Favorite"("portfolioItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_portfolioItemId_key" ON "Favorite"("userId", "portfolioItemId");

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Studio" ADD CONSTRAINT "Studio_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Studio" ADD CONSTRAINT "Studio_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterProfile" ADD CONSTRAINT "MasterProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMembership" ADD CONSTRAINT "StudioMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMembership" ADD CONSTRAINT "StudioMembership_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioInvite" ADD CONSTRAINT "StudioInvite_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioInvite" ADD CONSTRAINT "StudioInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_rotatedToSessionId_fkey" FOREIGN KEY ("rotatedToSessionId") REFERENCES "RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicUsernameAlias" ADD CONSTRAINT "PublicUsernameAlias_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicUsernameAlias" ADD CONSTRAINT "PublicUsernameAlias_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCardPhoto" ADD CONSTRAINT "ClientCardPhoto_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ClientCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCardPhoto" ADD CONSTRAINT "ClientCardPhoto_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_globalCategoryId_fkey" FOREIGN KEY ("globalCategoryId") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingQuestion" ADD CONSTRAINT "ServiceBookingQuestion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_masterProviderId_fkey" FOREIGN KEY ("masterProviderId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterService" ADD CONSTRAINT "MasterService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotSlot" ADD CONSTRAINT "HotSlot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotSlot" ADD CONSTRAINT "HotSlot_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotSlotSubscription" ADD CONSTRAINT "HotSlotSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotSlotSubscription" ADD CONSTRAINT "HotSlotSubscription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_masterProviderId_fkey" FOREIGN KEY ("masterProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_referencePhotoAssetId_fkey" FOREIGN KEY ("referencePhotoAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingChat" ADD CONSTRAINT "BookingChat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "BookingChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBreak" ADD CONSTRAINT "ScheduleBreak_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTemplateBreak" ADD CONSTRAINT "ScheduleTemplateBreak_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyScheduleConfig" ADD CONSTRAINT "WeeklyScheduleConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyScheduleDay" ADD CONSTRAINT "WeeklyScheduleDay_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WeeklyScheduleConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyScheduleDay" ADD CONSTRAINT "WeeklyScheduleDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VkLink" ADD CONSTRAINT "VkLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset_embeddings" ADD CONSTRAINT "media_asset_embeddings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_masterServiceId_fkey" FOREIGN KEY ("masterServiceId") REFERENCES "MasterService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOffer" ADD CONSTRAINT "ModelOffer_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ModelOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelApplication" ADD CONSTRAINT "ModelApplication_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTagOnReview" ADD CONSTRAINT "ReviewTagOnReview_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTagOnReview" ADD CONSTRAINT "ReviewTagOnReview_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ReviewTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMember" ADD CONSTRAINT "StudioMember_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMember" ADD CONSTRAINT "StudioMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalCategory" ADD CONSTRAINT "GlobalCategory_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalCategory" ADD CONSTRAINT "GlobalCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalCategory" ADD CONSTRAINT "GlobalCategory_createdByProviderId_fkey" FOREIGN KEY ("createdByProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_relatedCategoryId_fkey" FOREIGN KEY ("relatedCategoryId") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_inheritsFromPlanId_fkey" FOREIGN KEY ("inheritsFromPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPlanPrice" ADD CONSTRAINT "BillingPlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingServiceItem" ADD CONSTRAINT "BookingServiceItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_global_category_id_fkey" FOREIGN KEY ("global_category_id") REFERENCES "GlobalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemService" ADD CONSTRAINT "PortfolioItemService_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemService" ADD CONSTRAINT "PortfolioItemService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemTag" ADD CONSTRAINT "PortfolioItemTag_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItemTag" ADD CONSTRAINT "PortfolioItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [02/36]  20260328175037_add_slot_freed_weekly_stats_notification_types
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SLOT_FREED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MASTER_WEEKLY_STATS';

-- ═══════════════════════════════════════════════════════════════════════════
-- [03/36]  20260328180000_add_smart_price_fields
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN "smartPriceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HotSlot" ADD COLUMN "isAuto" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- [04/36]  20260409120000_add_email_otp
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('PHONE', 'EMAIL');

-- AlterTable: make phone nullable, add email and channel
ALTER TABLE "OtpCode" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "OtpCode" ADD COLUMN "email" TEXT;
ALTER TABLE "OtpCode" ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'PHONE';

-- CreateIndex
CREATE INDEX "OtpCode_email_idx" ON "OtpCode"("email");

-- ═══════════════════════════════════════════════════════════════════════════
-- [05/36]  20260411180000_add_model_offer_public_code
-- ═══════════════════════════════════════════════════════════════════════════

-- Add publicCode to ModelOffer for public-safe URL slugs
ALTER TABLE "ModelOffer" ADD COLUMN "publicCode" TEXT;

-- Backfill existing rows with a random unique code (uuid-based, prefixed)
UPDATE "ModelOffer" SET "publicCode" = 'mc' || replace(gen_random_uuid()::text, '-', '') WHERE "publicCode" IS NULL;

-- Apply NOT NULL constraint after backfill
ALTER TABLE "ModelOffer" ALTER COLUMN "publicCode" SET NOT NULL;

-- Add unique index
CREATE UNIQUE INDEX "ModelOffer_publicCode_key" ON "ModelOffer"("publicCode");

-- ═══════════════════════════════════════════════════════════════════════════
-- [06/36]  20260424000000_add_media_crop_fields
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "cropX" DOUBLE PRECISION,
                         ADD COLUMN "cropY" DOUBLE PRECISION,
                         ADD COLUMN "cropWidth" DOUBLE PRECISION,
                         ADD COLUMN "cropHeight" DOUBLE PRECISION;

-- ═══════════════════════════════════════════════════════════════════════════
-- [07/36]  20260424100000_add_review_report_reason
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ReviewReportReason" AS ENUM ('SPAM', 'FAKE', 'OFFENSIVE', 'INAPPROPRIATE', 'OTHER');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "reportReason" "ReviewReportReason";

-- ═══════════════════════════════════════════════════════════════════════════
-- [08/36]  20260427000000_add_email_notifications_enabled
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- [09/36]  20260427100000_remove_focal_point
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove focal point fields from MediaAsset, Provider, and UserProfile
-- Focal point functionality was replaced by crop-based positioning (cropX/Y/Width/Height)

ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "focalX";
ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "focalY";

ALTER TABLE "Provider" DROP COLUMN IF EXISTS "avatarFocalX";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "avatarFocalY";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "bannerFocalX";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "bannerFocalY";

ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "avatarFocalX";
ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "avatarFocalY";

-- ═══════════════════════════════════════════════════════════════════════════
-- [10/36]  20260427153437_feed_stories_autopub_and_indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "autoPublishStoriesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "PortfolioItem_isPublic_createdAt_id_idx" ON "PortfolioItem"("isPublic", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Provider_isPublished_autoPublishStoriesEnabled_idx" ON "Provider"("isPublished", "autoPublishStoriesEnabled");

-- ═══════════════════════════════════════════════════════════════════════════
-- [11/36]  20260428062602_multi_city_foundation
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "cityId" TEXT;

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameGenitive" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "autoCreated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_isActive_sortOrder_idx" ON "City"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Provider_cityId_isPublished_idx" ON "Provider"("cityId", "isPublished");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [12/36]  20260430000000_add_trial_to_user_subscription
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable: trial fields on UserSubscription.
-- See model comment in billing.prisma for the in-place mutation contract.
ALTER TABLE "UserSubscription"
  ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "trialEndingNotificationSentAt" TIMESTAMP(3);

-- Partial index on active trial rows only — keeps the index small and fast for
-- the only query that hits these columns (the trial-expiry cron).
CREATE INDEX "UserSubscription_isTrial_trialEndsAt_idx"
  ON "UserSubscription" ("isTrial", "trialEndsAt")
  WHERE "isTrial" = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- [13/36]  20260430000100_add_trial_notification_types
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum: trial notification types must be in their own migration because
-- PostgreSQL `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
-- alongside other DDL statements.
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_TRIAL_ENDING_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_TRIAL_EXPIRED';

-- ═══════════════════════════════════════════════════════════════════════════
-- [14/36]  20260513115124_add_mrr_snapshot
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- [15/36]  20260513224252_pre_launch_audit_soft_delete_block
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_PLAN_GRANTED', 'USER_BLOCKED', 'USER_UNBLOCKED', 'USER_ROLE_ADDED', 'USER_ROLE_REMOVED', 'USER_ACCOUNT_DELETED', 'BILLING_PLAN_EDITED', 'BILLING_SUBSCRIPTION_CANCELLED', 'BILLING_PAYMENT_REFUNDED', 'CITY_CREATED', 'CITY_UPDATED', 'CITY_DELETED', 'CITY_MERGED', 'CITY_VERIFIED', 'CATEGORY_APPROVED', 'CATEGORY_REJECTED', 'CATEGORY_EDITED', 'REVIEW_APPROVED', 'REVIEW_DELETED', 'REVIEW_RESTORED', 'SETTINGS_LOGO_UPDATED', 'SETTINGS_LOGIN_HERO_UPDATED', 'SETTINGS_SEO_UPDATED', 'SETTINGS_FLAG_TOGGLED', 'SETTINGS_APP_SETTING_UPDATED');

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "deletedReason" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedByUserId" TEXT,
ADD COLUMN     "blockedReason" TEXT;

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_deletedAt_idx" ON "Review"("deletedAt");

-- CreateIndex
CREATE INDEX "UserProfile_blockedAt_idx" ON "UserProfile"("blockedAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_blockedByUserId_fkey" FOREIGN KEY ("blockedByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [16/36]  20260514000936_add_admin_initiated_notification_types
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PLAN_GRANTED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PLAN_EDITED';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_PAYMENT_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_DELETED_BY_ADMIN';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_GRANTED_BY_ADMIN';

-- ═══════════════════════════════════════════════════════════════════════════
-- [17/36]  20260519120000_add_chat_attachment
-- ═══════════════════════════════════════════════════════════════════════════

-- CHAT-FOUNDATION-A-MIGRATION
-- Adds optional image-attachment support to ChatMessage, mirroring the
-- booking-reference upload pattern (kind+entityType-tagged MediaAsset,
-- owner-scoped via createdByUserId, marked used when persisted).
--
-- Backwards-compatible:
--   - all existing ChatMessage rows get attachmentMediaAssetId = NULL
--   - existing senders (without attachment payload) work unchanged
--   - existing MediaKind / MediaEntityType consumers untouched
--
-- 3 enum values + 1 nullable column + 1 FK + 1 index.

-- AlterEnum: add chat-message entity type
ALTER TYPE "MediaEntityType" ADD VALUE 'CHAT_MESSAGE';

-- AlterEnum: add chat-attachment kind
ALTER TYPE "MediaKind" ADD VALUE 'CHAT_ATTACHMENT';

-- AlterTable: add nullable attachment column
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentMediaAssetId" TEXT;

-- AddForeignKey: on-delete SetNull preserves the chat message text if
-- the asset row is ever removed (mirrors the Booking referencePhotoAssetId
-- relation, which also uses SetNull semantics).
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_attachmentMediaAssetId_fkey"
  FOREIGN KEY ("attachmentMediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: lookup attachments per asset (e.g. when cleaning up
-- orphan MediaAssets that haven't been linked to any chat message).
CREATE INDEX "ChatMessage_attachmentMediaAssetId_idx"
  ON "ChatMessage"("attachmentMediaAssetId");

-- ═══════════════════════════════════════════════════════════════════════════
-- [18/36]  20260530000000_reconcile_drifted_schema
-- ═══════════════════════════════════════════════════════════════════════════

-- MIGRATION-RECONCILIATION-BATCH (2026-05-30) — reconciles schema.prisma vs migrations history
-- after sprint-long drift from `prisma db push` usage (documented in seeds README pre-fix).
-- See MASTERRYADOM_AI_CONTEXT.md раздел 15 + BACKLOG.md «MIGRATION-RECONCILIATION» for context.
--
-- Generated via: prisma migrate diff --from-migrations prisma/schema/migrations
--                                    --to-schema-datamodel prisma/schema --script
-- Manual review of 24 operations completed; one CREATE INDEX deliberately skipped (see note below).

-- AlterEnum
ALTER TYPE "ChatSenderType" ADD VALUE 'SYSTEM';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "referencedBookingId" TEXT,
ADD COLUMN     "systemEventKey" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "acceptNewClients" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateCancelAction" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "maxBookingDaysAhead" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "minBookingHoursAhead" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "slotPrecision" TEXT NOT NULL DEFAULT 'exact',
ADD COLUMN     "slotStepMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "visibleSlotDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "ScheduleTemplateBreak" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "hideAgeYear" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ConversationSlug" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSlug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackageItem" (
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackageItem_pkey" PRIMARY KEY ("packageId","serviceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSlug_slug_key" ON "ConversationSlug"("slug");

-- CreateIndex
CREATE INDEX "ConversationSlug_slug_idx" ON "ConversationSlug"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSlug_providerId_clientUserId_key" ON "ConversationSlug"("providerId", "clientUserId");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_createdAt_idx" ON "UserFavorite"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_providerId_key" ON "UserFavorite"("userId", "providerId");

-- CreateIndex
CREATE INDEX "ServicePackage_masterId_sortOrder_idx" ON "ServicePackage"("masterId", "sortOrder");

-- CreateIndex
CREATE INDEX "ServicePackage_masterId_isEnabled_idx" ON "ServicePackage"("masterId", "isEnabled");

-- CreateIndex
CREATE INDEX "ServicePackageItem_serviceId_idx" ON "ServicePackageItem"("serviceId");

-- CreateIndex
CREATE INDEX "ChatMessage_referencedBookingId_idx" ON "ChatMessage"("referencedBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_referencedBookingId_systemEventKey_key" ON "ChatMessage"("referencedBookingId", "systemEventKey");

-- CreateIndex
CREATE INDEX "Notification_userId_deletedAt_createdAt_idx" ON "Notification"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_masterId_sortOrder_idx" ON "PortfolioItem"("masterId", "sortOrder");

-- NOTE (MIGRATION-RECONCILIATION review 2026-05-30):
-- The Prisma diff generator wanted to add this index here:
--   CREATE INDEX "UserSubscription_isTrial_trialEndsAt_idx" ON "UserSubscription"("isTrial", "trialEndsAt");
-- DELIBERATELY SKIPPED — earlier migration 20260430000000_add_trial_to_user_subscription
-- already created an index of this exact name as a PARTIAL index
-- (WHERE "isTrial" = true) which the schema's `@@index([isTrial, trialEndsAt])`
-- decorator cannot express in Prisma. The partial index covers the only query that
-- uses it (cron lookup of expiring trials where isTrial=true), so the optimization is
-- preserved. Schema decorator and DB state intentionally diverge here; do not let CI
-- drift checker auto-reconcile by dropping the partial. See backlog item
-- TRIAL-INDEX-FORMALIZE for an optional cleanup that aligns both representations.

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_referencedBookingId_fkey" FOREIGN KEY ("referencedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [19/36]  20260619000000_provider_timezone_default_moscow
-- ═══════════════════════════════════════════════════════════════════════════

-- FIX-R2-02-A — resolve the long-standing T4 inconsistency where
-- `Provider.timezone` defaulted to 'Asia/Almaty' while City.timezone +
-- env.DEFAULT_TIMEZONE + .env all use 'Europe/Moscow'. New providers that
-- omit a timezone now start on the platform default; the working tz is
-- re-derived from the provider's City on address-save.
--
-- Non-destructive: only changes the column DEFAULT for future inserts.
-- Existing rows keep their stored value (a master legitimately on
-- Asia/Almaty is NOT shifted).
ALTER TABLE "Provider" ALTER COLUMN "timezone" SET DEFAULT 'Europe/Moscow';

-- ═══════════════════════════════════════════════════════════════════════════
-- [20/36]  20260624140407_add_booking_package
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "BookingPackageStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "bookingPackageId" TEXT;

-- AlterTable
ALTER TABLE "ServicePackageItem" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- PACKAGE-BOOKING-MVP-1: backfill sortOrder by the current per-package
-- createdAt order so existing packages keep their component sequence.
WITH ordered AS (
  SELECT "packageId", "serviceId",
         ROW_NUMBER() OVER (
           PARTITION BY "packageId" ORDER BY "createdAt" ASC, "serviceId" ASC
         ) - 1 AS rn
  FROM "ServicePackageItem"
)
UPDATE "ServicePackageItem" spi
SET "sortOrder" = ordered.rn
FROM ordered
WHERE spi."packageId" = ordered."packageId"
  AND spi."serviceId" = ordered."serviceId";

-- CreateTable
CREATE TABLE "BookingPackage" (
    "id" TEXT NOT NULL,
    "servicePackageId" TEXT,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "totalKopeks" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPackage_providerId_idx" ON "BookingPackage"("providerId");

-- CreateIndex
CREATE INDEX "BookingPackage_clientUserId_idx" ON "BookingPackage"("clientUserId");

-- CreateIndex
CREATE INDEX "BookingPackage_servicePackageId_idx" ON "BookingPackage"("servicePackageId");

-- CreateIndex
CREATE INDEX "Booking_bookingPackageId_idx" ON "Booking"("bookingPackageId");

-- CreateIndex
CREATE INDEX "ServicePackageItem_packageId_sortOrder_idx" ON "ServicePackageItem"("packageId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingPackageId_fkey" FOREIGN KEY ("bookingPackageId") REFERENCES "BookingPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "ServicePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPackage" ADD CONSTRAINT "BookingPackage_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [21/36]  20260626000000_add_push_notifications_enabled
-- ═══════════════════════════════════════════════════════════════════════════

-- FIX-EXP-NOTIFICATIONS (EXP-027): per-user push on/off preference.
-- Opt-in (default false). Additive, non-destructive (ADD COLUMN with default).
ALTER TABLE "UserProfile" ADD COLUMN "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- [22/36]  20260629201051_add_yandex_link
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- [23/36]  20260702000000_add_provider_social_links
-- ═══════════════════════════════════════════════════════════════════════════

-- FEAT-PROVIDER-SOCIALS: free-text VK / Instagram community-page links on
-- Provider (serves both studios and masters — both are Provider rows).
-- Stored as a normalized, safe `https://<host>/<handle>` URL (or NULL).
-- Additive, non-destructive (two nullable columns, no default, no backfill).
-- Created with --create-only semantics: NOT auto-applied — apply on prod via
-- `npx prisma migrate deploy` (rule 16).
ALTER TABLE "Provider" ADD COLUMN "socialVk" TEXT;
ALTER TABLE "Provider" ADD COLUMN "socialInstagram" TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- [24/36]  20260707221738_renewal_price_optin
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_RENEWAL_PRICE_INCREASE';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "pendingPriceKopeks" INTEGER,
ADD COLUMN     "pendingPriceOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceOptIn24hSentAt" TIMESTAMP(3),
ADD COLUMN     "priceOptIn2hSentAt" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════════════
-- [25/36]  20260713120000_reduce_embedding_dimensions_yandex
-- ═══════════════════════════════════════════════════════════════════════════

-- VISUAL-SEARCH-YANDEX-MIGRATION-01 (Variant A — full Yandex; SPIKE-02 verdict).
--
-- Reduce the visual-search embedding dimension 1536 -> 256. Yandex
-- `text-search-doc` / `text-search-query` emit 256 dims natively (confirmed on
-- fact by the spike). Any vectors already present were produced by the OpenAI
-- 1536-dim embedder and are structurally invalid after this change, so they are
-- deleted here; the backfill (scripts/backfill-visual-embeddings.ts) re-embeds
-- every portfolio asset with the new provider before the feature is enabled.
--
-- Harmless today — the table holds 0 rows in all known environments — but the
-- DELETE also makes the ALTER safe on a non-empty column and enforces the
-- invariant "no stale-dimension vectors survive a dimension change".
DELETE FROM "media_asset_embeddings";

ALTER TABLE "media_asset_embeddings"
    ALTER COLUMN "embedding" TYPE public.vector(256);

-- F2: approximate-nearest-neighbour index on the new-dimension column. Cosine
-- ops class matches the `<=>` operator the searcher uses. The table is empty at
-- migration time so the build is free. Requires pgvector >= 0.5.0 (hnsw); the
-- project image is pgvector/pgvector:pg16, which satisfies this.
CREATE INDEX "media_asset_embeddings_embedding_hnsw_idx"
    ON "media_asset_embeddings"
    USING hnsw ("embedding" public.vector_cosine_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- [26/36]  20260801223527_rkn_fix_01_consent_purposes
-- ═══════════════════════════════════════════════════════════════════════════

-- RKN-FIX-01 — consent recorded per purpose, per document version
-- (152-ФЗ ст. 9 в ред. 156-ФЗ, действует с 01.09.2025).
--
-- 1. `PD_PROCESSING` — consent to personal-data processing gets its own value
--    instead of overloading `PRIVACY`. The privacy policy is an informational
--    disclosure; the PD consent is a separate act against a separate document
--    (`/consent`), and the stored row has to say which of the two it proves.
--    NOTE: Postgres forbids USING a new enum value in the transaction that adds
--    it. Nothing here does — the value is only written by application code.
--
-- 2. The uniqueness moves from (userId, consentType) to
--    (userId, consentType, documentVersion). One row per version means a
--    version bump produces a NEW row on the next login while the earlier proof
--    survives — that history is the evidence 152-ФЗ asks for. The old
--    constraint made version bumps unrepresentable.
--
-- Pre-launch: only seed/test accounts exist, so no backfill is needed. Existing
-- rows keep their `documentVersion` and simply widen into the new constraint;
-- duplicates are impossible because the old constraint was strictly narrower.

-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'PD_PROCESSING';

-- DropIndex
DROP INDEX "UserConsent_userId_consentType_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserConsent_userId_consentType_documentVersion_key" ON "UserConsent"("userId", "consentType", "documentVersion");

-- ═══════════════════════════════════════════════════════════════════════════
-- [27/36]  20260803094523_rkn_fix_12_drop_oauth_tokens
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Warnings:

  - You are about to drop the column `accessToken` on the `VkLink` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `VkLink` table. All the data in the column will be lost.
  - You are about to drop the column `accessToken` on the `YandexLink` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `YandexLink` table. All the data in the column will be lost.

  Intentional: RKN-FIX-12 stops persisting third-party OAuth tokens. The audit
  found them write-only (the OAuth callback fetches the profile with the FRESH
  token from the code exchange, never from the DB), so no read path is broken
  and no data needs migrating anywhere — the values are simply gone. Re-linking
  is unaffected; the identity columns (vkUserId / yandexUserId) and deviceId
  stay.
*/
-- NOTE (manual edit, RKN-FIX-12): `prisma migrate dev` also emitted
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- which has been REMOVED here. That index is created in raw SQL by
-- 20260713120000_reduce_embedding_dimensions_yandex on an
-- `Unsupported("vector(256)")` column; Prisma cannot represent it in the
-- datamodel, so every `migrate dev` re-proposes dropping it. Applying it would
-- silently degrade visual-search ANN lookups to a sequential scan. Unrelated to
-- this change — see the VECTOR-INDEX-DRIFT backlog item.

-- AlterTable
ALTER TABLE "VkLink" DROP COLUMN "accessToken",
DROP COLUMN "refreshToken";

-- AlterTable
ALTER TABLE "YandexLink" DROP COLUMN "accessToken",
DROP COLUMN "refreshToken";

-- ═══════════════════════════════════════════════════════════════════════════
-- [28/36]  20260803105142_rkn_fix_10_pd_access_log
-- ═══════════════════════════════════════════════════════════════════════════

-- RKN-FIX-10 — append-only след массовых чтений ПДн (scoping инцидента за 24/72 ч).
-- ADD-only: новая таблица + новый enum, существующих данных не касается.

-- NOTE (ручная правка, второй случай подряд): `prisma migrate dev` снова добавил
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- и строка ЗДЕСЬ УДАЛЕНА. Индекс создаётся сырым SQL в
-- 20260713120000_reduce_embedding_dimensions_yandex на колонке
-- `Unsupported("vector(256)")`; Prisma не умеет держать его в датамодели и
-- предлагает дропнуть в КАЖДОЙ новой миграции. Применение убило бы ANN-поиск
-- visual-search, превратив его в seq-scan, без единого сообщения об ошибке.
-- Это уже второй раз (первый — 20260803094523_rkn_fix_12_drop_oauth_tokens):
-- баг воспроизводимый и системный, см. SCHEMA-DRIFT-GATE-BROKEN в BACKLOG.
-- Проверено после apply: индекс на месте.

-- CreateEnum
CREATE TYPE "PdAccessActorType" AS ENUM ('ADMIN', 'MASTER', 'STUDIO', 'SYSTEM');

-- CreateTable
CREATE TABLE "PdAccessLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "PdAccessActorType" NOT NULL,
    "surface" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "filterFingerprint" TEXT,
    "scopeProviderId" TEXT,
    "scopeStudioId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdAccessLog_actorUserId_createdAt_idx" ON "PdAccessLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_createdAt_idx" ON "PdAccessLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_surface_createdAt_idx" ON "PdAccessLog"("surface", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PdAccessLog_scopeProviderId_createdAt_idx" ON "PdAccessLog"("scopeProviderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PdAccessLog" ADD CONSTRAINT "PdAccessLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [29/36]  20260803123705_rkn_fix_18_consent_withdrawal
-- ═══════════════════════════════════════════════════════════════════════════

-- RKN-FIX-18 — отзыв согласия с сохранением истории.
--
-- Суть изменения: строки `UserConsent` больше НИКОГДА не оживляются.
-- Отзыв проставляет `revokedAt` (строка остаётся), повторное согласие
-- вставляет НОВУЮ строку. Прежний полный UNIQUE это запрещал и тем самым
-- вынуждал оживление, которое стирало доказательную историю (исходный
-- `agreedAt` и сам факт отзыва).
--
-- Замена: partial unique — «не более одной АКТИВНОЙ строки на
-- (userId, consentType, documentVersion)», отозванных сколько угодно.
-- Prisma partial unique не выражает, поэтому индекс живёт здесь, в сыром SQL,
-- и зарегистрирован в scripts/raw-sql-objects.mjs (вторая запись реестра).
--
-- NOTE (ручная правка — ТРЕТИЙ случай подряд): `prisma migrate dev` снова
-- дописал
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- Строка ЗДЕСЬ УДАЛЕНА. Это тот самый паттерн, ради которого в GATES-FIX-01
-- заведён гейт `npm run check:migration-drops`: без явного маркера
-- `-- ALLOW-DROP:` он теперь валит CI. Проверено после apply: HNSW на месте.

-- DropIndex
-- Намеренно: полный UNIQUE снимается, его заменяет partial unique ниже.
DROP INDEX "UserConsent_userId_consentType_documentVersion_key";

-- CreateIndex
CREATE INDEX "UserConsent_userId_consentType_documentVersion_idx" ON "UserConsent"("userId", "consentType", "documentVersion");

-- CreateIndex (raw SQL — Prisma не выражает partial unique)
-- Гарантия уровня БД: одна активная строка на цель+версию у пользователя.
-- Существующие данные ей удовлетворяют (проверено перед миграцией: 0 групп с
-- более чем одной активной строкой; отозванных строк на момент миграции нет).
CREATE UNIQUE INDEX "UserConsent_active_unique_idx"
    ON "UserConsent" ("userId", "consentType", "documentVersion")
    WHERE "revokedAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- [30/36]  20260803230000_booking_drop_legacy_time_columns
-- ═══════════════════════════════════════════════════════════════════════════

-- BOOKING-TIME-COLUMNS-01 — у брони остаётся ОДИН источник времени.
--
-- Удаляются legacy-колонки `Booking.startAt` / `Booking.endAt`, дублировавшие
-- каноническую UTC-пару `startAtUtc`/`endAtUtc` (инв. #1, CLAUDE.md rule 8).
--
-- ПОЧЕМУ ЭТО БЕЗОПАСНО — доказательства, собранные до правки:
--   • WRITE: все 9 путей, создающих/переносящих бронь, писали ОБЕ пары из
--     ОДНОГО выражения (`startAt: startAtUtc`). Ни одного асимметричного
--     write не нашлось, т.е. разойтись значения не могли в принципе.
--   • READ: функциональных читателей не было. Единственное упоминание —
--     мёртвый `select` в `confirmBooking.ts`, значение которого никогда не
--     использовалось. Все прочие `startAt`-селекты в коде принадлежат МОДЕЛИ
--     `TimeBlock`, у которой это собственные канонические поля.
--   • ДАННЫЕ (dev, 167 броней): расхождений ноль (`startAt <> startAtUtc` — 0
--     строк, то же для end). Более того, 101 строка уже имела `startAt = NULL`
--     при заполненном `startAtUtc` — сиды не писали legacy-пару давно, и это
--     ни на что не влияло. Бэкфилл поэтому НЕ нужен.
--   • ИНДЕКСЫ: на legacy-паре не было ни одного (все индексы времени —
--     на `startAtUtc`). DROP не задевает планы запросов.
--   • ПУБЛИЧНЫЙ КОНТРАКТ: поле `startAt` в OpenAPI — это DTO студийного
--     календаря, и оно наполняется из `startAtUtc` (`calendar.service.ts`).
--     Имя ответа не меняется, мобильный клиент не затронут.
--
-- SEQUENCING: обе колонки NULLABLE, поэтому «писатели перестали» и «колонки
-- удалены» не обязаны быть одной транзакцией — вставки не сломались бы и в
-- промежутке. Тем не менее оба шага идут ОДНИМ изменением: pre-launch деплой
-- одноразовый, и оставлять несогласованное состояние между шагами незачем.
--
-- NOTE (ручная правка — ЧЕТВЁРТЫЙ случай подряд): `prisma migrate diff` снова
-- предложил
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- Строка ЗДЕСЬ УДАЛЕНА. Ровно этот паттерн ловит гейт
-- `npm run check:migration-drops` (реестр `scripts/raw-sql-objects.mjs`).
-- Проверено после apply: HNSW и partial-unique на месте.

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "endAt",
DROP COLUMN "startAt";

-- ═══════════════════════════════════════════════════════════════════════════
-- [31/36]  20260805091533_refresh_session_family_sec13
-- ═══════════════════════════════════════════════════════════════════════════

-- SEC-13. Prisma дописывает сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` в КАЖДУЮ новую миграцию: индекс
-- hnsw из pgvector она не выражает в датамодели и потому считает лишним.
-- Строка снята вручную (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Применённый DROP молча превратил бы ANN-поиск
-- visual-search в seq-scan, без единой ошибки.

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "RefreshSession_userId_familyId_revokedAt_idx" ON "RefreshSession"("userId", "familyId", "revokedAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- [32/36]  20260805182128_logic_19_timeblock_master_fk
-- ═══════════════════════════════════════════════════════════════════════════

-- LOGIC-19. Prisma дописала сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` — она делает это в КАЖДУЮ новую
-- миграцию, потому что тип индекса `hnsw` из pgvector в датамодели не
-- выражается (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Строка снята вручную; применённый DROP молча
-- превратил бы ANN-поиск visual-search в seq-scan, без единой ошибки.
-- Пятый случай подряд: `migrate dev` успевает применить его к dev-БД до
-- ревью, поэтому индекс здесь же и пересоздаётся (см. отчёт).

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- [33/36]  20260805183412_logic_20_numeric_range_checks
-- ═══════════════════════════════════════════════════════════════════════════

-- LOGIC-20 — CHECK-констрейнты на числовые бизнес-диапазоны.
--
-- Диапазоны держались ИСКЛЮЧИТЕЛЬНО на Zod и ручных проверках в коде. Сегодня
-- все пути записи валидируют, поэтому эксплуатируемого дефекта нет; проблема в
-- том, что защита существует ровно там, где кто-то её написал: новый путь
-- записи, миграция данных или сид сохранят отрицательную цену или нулевую
-- длительность без единого возражения БД. Тот же класс, что инв. #35/#38 —
-- инвариант, живущий только в приложении.
--
-- Prisma не выражает CHECK в датамодели (нет `@db.Check` на 6.19.x). Проверено
-- эмпирически (пробная `migrate dev --create-only` на неизменной датамодели):
-- diff-движок check-констрейнты ИГНОРИРУЕТ — в отличие от hnsw-индекса, их DROP
-- в новые миграции не дописывается, то есть ловушка «снять строку руками» не
-- размножается. Именно поэтому имена всё равно внесены в реестр
-- scripts/raw-sql-objects.mjs: раз Prisma их не видит, её гейты сами по себе
-- ничего о них не скажут, и дроп такого констрейнта прошёл бы незамеченным —
-- ловит его `check:migration-drops`, который читает реестр.
--
-- ⚠️ Прод: ADD CONSTRAINT ... CHECK проверяет существующие строки и упадёт при
-- нарушениях. Инвентарные запросы — в DEPLOY-BACKLOG.md. На dev-базе нарушений
-- ноль (проверено перед созданием миграции).
--
-- Границы выбраны НЕ шире прикладных, чтобы констрейнт не смог отвергнуть то,
-- что приложение считает валидным:
--   • priceSnapshot >= 0            — цена в копейках; ноль легитимен (бесплатная услуга)
--   • durationSnapshotMin > 0       — услуга нулевой длительности не бронируема
--   • rating BETWEEN 1 AND 5        — шкала отзыва (reviews/service.ts)
--   • bufferBetweenBookingsMin 0..30 — ровно потолок normalizeBufferMinutes (booking-core.ts)

ALTER TABLE "BookingServiceItem"
  ADD CONSTRAINT "BookingServiceItem_priceSnapshot_nonnegative_check"
  CHECK ("priceSnapshot" >= 0);

ALTER TABLE "BookingServiceItem"
  ADD CONSTRAINT "BookingServiceItem_durationSnapshotMin_positive_check"
  CHECK ("durationSnapshotMin" > 0);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range_check"
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "Provider"
  ADD CONSTRAINT "Provider_bufferBetweenBookingsMin_range_check"
  CHECK ("bufferBetweenBookingsMin" BETWEEN 0 AND 30);

-- ═══════════════════════════════════════════════════════════════════════════
-- [34/36]  20260806084318_add_perf_composite_indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- PERF-09. Prisma дописала сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` — она делает это в КАЖДУЮ новую
-- миграцию, потому что тип индекса `hnsw` из pgvector в датамодели не
-- выражается (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Строка снята вручную; применённый DROP молча
-- превратил бы ANN-поиск visual-search в seq-scan, без единой ошибки.
-- Шестой случай подряд: `migrate dev` успевает применить его к dev-БД до
-- ревью, поэтому индекс пересоздан отдельной командой (см. отчёт).
--
-- Пять композитных индексов ниже — позиции I-1, I-2, I-3, I-6, I-7 из
-- AUDIT-FRESH-04. Каждый закрывает разрыв «фильтр по индексу, сортировка
-- поверх всего набора» на экране, который пользователь открывает первым в
-- своей роли. Существующие однополевые индексы намеренно НЕ удалены: их
-- удаление — самостоятельный `DROP` со своей ценой ошибки, а не побочный
-- эффект добавления.
--
-- ⚠️ Прод: `CREATE INDEX` берёт SHARE-lock и блокирует запись в таблицу на
-- время сборки. `Booking`, `Provider` и `Review` — горячие. Инструкция и
-- вариант с `CONCURRENTLY` — в DEPLOY-BACKLOG.md.

-- CreateIndex
CREATE INDEX "Booking_masterProviderId_startAtUtc_idx" ON "Booking"("masterProviderId", "startAtUtc");

-- CreateIndex
CREATE INDEX "Booking_clientUserId_startAtUtc_idx" ON "Booking"("clientUserId", "startAtUtc" DESC);

-- CreateIndex
CREATE INDEX "Booking_studioId_startAtUtc_idx" ON "Booking"("studioId", "startAtUtc" DESC);

-- CreateIndex
CREATE INDEX "Provider_cityId_isPublished_ratingAvg_reviews_createdAt_idx" ON "Provider"("cityId", "isPublished", "ratingAvg" DESC, "reviews" DESC, "createdAt" DESC);

-- I-7 — ЧАСТИЧНЫЙ индекс, поэтому сырым SQL (Prisma частичные индексы не
-- выражает; имя внесено в scripts/raw-sql-objects.mjs).
--
-- Форма, предложенная аудитом — `(targetType, targetId, deletedAt, createdAt)`
-- обычным `@@index` — сортировку НЕ убирает. Проверено EXPLAIN'ом на dev-БД
-- (`enable_seqscan=off, enable_sort=off`, конкурирующий индекс временно снят):
-- план остаётся `Index Scan … -> Sort (Sort Key: "createdAt" DESC)`. Причина в
-- том, что Postgres принимает `deletedAt IS NULL` как условие индекса, но не
-- считает его равенством, сохраняющим порядок по следующей колонке ключа. С
-- частичным индексом `Sort` из плана исчезает совсем.
--
-- Предикат дословно повторяет ACTIVE_REVIEW_FILTER (src/lib/reviews/soft-delete.ts,
-- инвариант #17): разойтись им нельзя — при расхождении индекс просто перестанет
-- подхватываться, молча.
CREATE INDEX "Review_active_target_createdAt_idx"
    ON "Review"("targetType", "targetId", "createdAt" DESC)
    WHERE "deletedAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- [35/36]  20260812104330_email_partial_unique_verified_only
-- ═══════════════════════════════════════════════════════════════════════════

-- EMAIL-ADDRESS-OCCUPATION — уникальность email только по ПОДТВЕРЖДЁННЫМ адресам.
--
-- Суть изменения. `email` был `@unique` целиком, а записать чужой адрес себе в
-- профиль может любой аутентифицированный пользователь (пять путей: `/api/me`,
-- кабинетный профиль, кабинетный `email/request-verify`, оба OAuth-колбэка).
-- Захват аккаунта закрыт раньше (FIX-SEC-EMAIL-IDENTITY-01: вход резолвит
-- только `emailVerifiedAt IS NOT NULL`), но СТРОКА оставалась и занимала адрес:
-- владелец при регистрации/верификации упирался в P2002 и получал 409
-- «Обратитесь в поддержку» — на проде это единственный включённый канал входа
-- (`PHONE_AUTH_ENABLED` off), то есть отказ в обслуживании владельцу адреса.
--
-- Замена: «заявить» адрес может кто угодно и сколько угодно строк, «владеть» —
-- ровно одна, и владение даёт только доказательство. Prisma частичные
-- уникальные индексы не выражает, поэтому индекс живёт здесь, сырым SQL, и
-- зарегистрирован в `scripts/raw-sql-objects.mjs` (четвёртая запись реестра —
-- ровно тот «ожидаемый следующий житель», о котором говорит его шапка).
--
-- ⚠️ Предикат индекса обязан ДОСЛОВНО совпадать с фильтром
-- `findVerifiedEmailProfile` (`src/lib/auth/email-login-profile.ts`): при
-- расхождении БД начнёт гарантировать не то множество, которое читает вход.
--
-- NOTE (ручная правка — СЕДЬМОЙ случай подряд): `prisma migrate dev` снова
-- дописал в конец
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- Строка ЗДЕСЬ УДАЛЕНА. Ради этого паттерна и заведён `check:migration-drops`.
--
-- Про `DROP INDEX "UserProfile_email_key"` ниже: он НАМЕРЕННЫЙ и является
-- предметом миграции. В реестре raw-sql его нет (это обычный индекс Prisma),
-- поэтому маркер `-- ALLOW-DROP:` гейт для него не требует.

-- DropIndex
DROP INDEX "UserProfile_email_key";

-- CreateIndex (raw: partial unique — Prisma не выражает)
CREATE UNIQUE INDEX "UserProfile_email_verified_unique_idx"
  ON "UserProfile" ("email")
  WHERE "emailVerifiedAt" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- [36/36]  20260812204339_fix_b16_ai_spend_counter
-- ═══════════════════════════════════════════════════════════════════════════

-- FIX-B16 — durable суточный счётчик платных AI-вызовов.
--
-- Потолок расходов не может жить в Redis: там он обнуляется рестартом процесса
-- и умножается на число процессов при memory-fallback, то есть верхней границы
-- расходов не задаёт вовсе. PK — составной (meter, dayKey), поэтому инкремент
-- выражается одним атомарным UPSERT'ом без отдельного уникального индекса.
--
-- ⚠️ Сгенерированный `prisma migrate dev` файл содержал ВОСЬМОЕ по счёту
-- предложение `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx"` — снято
-- вручную при ревью. Индекс не выражается в датамодели (pgvector HNSW, реестр
-- `scripts/raw-sql-objects.mjs`), и его применение молча превратило бы
-- ANN-поиск visual-search в seq-scan.

-- CreateTable
CREATE TABLE "AiSpendCounter" (
    "meter" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSpendCounter_pkey" PRIMARY KEY ("meter","dayKey")
);
