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
