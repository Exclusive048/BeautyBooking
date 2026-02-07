import { AccountType, NotificationType, Prisma, type ReviewTargetType, type UserProfile } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { canLeaveReview } from "@/lib/reviews/can-leave";
import {
  REVIEW_PRIVATE_TAGS_MAX,
  REVIEW_PUBLIC_TAGS_MAX,
  REVIEW_WINDOW_DAYS,
} from "@/lib/reviews/constants";
import { toReviewDto, type ReviewDto, type ReviewTagDto } from "@/lib/reviews/types";

// AUDIT MATRIX (task sections 1-9)
// 1) Tag taxonomy: IMPLEMENTED (ReviewTag dictionary + seed).
// 2) Data model: IMPLEMENTED (ReviewTag + ReviewTagOnReview relations).
// 3) "3-second review" payload: PARTIAL (server accepts/validates tag ids; UI chips pending).
// 4) Public/private visibility split: PARTIAL (server split implemented, UI rendering pending).
// 5) Superpower badges: ABSENT (no aggregation by public tags).
// 6) Smart filters: ABSENT (catalog has no review-tag strategy).
// 7) Private tag summary for master: ABSENT.
// 8) Existing core review constraints:
//    - FINISHED + 3-day window: IMPLEMENTED via canLeaveReview().
//    - delete before master reply: IMPLEMENTED in deleteReview().
//    - master reply only once: IMPLEMENTED in replyToReview().
// 9) Iterative plan status is tracked with comments in review/catalog/provider modules.

type BookingForCreate = Prisma.BookingGetPayload<{
  select: {
    id: true;
    clientUserId: true;
    status: true;
    startAtUtc: true;
    endAtUtc: true;
    service: { select: { durationMin: true } };
    provider: { select: { id: true; type: true } };
  };
}>;

type ReviewTagLite = {
  id: string;
  type: "PUBLIC" | "PRIVATE";
};

const reviewInclude = {
  author: { select: { displayName: true } },
  booking: { select: { clientName: true } },
  tags: {
    include: {
      tag: {
        select: {
          id: true,
          code: true,
          label: true,
          icon: true,
          type: true,
        },
      },
    },
  },
} as const;

type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

function toReviewTagDto(tag: {
  id: string;
  code: string;
  label: string;
  icon: string | null;
  type: "PUBLIC" | "PRIVATE";
}): ReviewTagDto {
  return {
    id: tag.id,
    code: tag.code,
    label: tag.label,
    icon: tag.icon,
    type: tag.type,
  };
}

function requireReviewTarget(booking: BookingForCreate): { targetType: ReviewTargetType; targetId: string } {
  if (booking.provider.type === "MASTER") {
    return { targetType: "provider", targetId: booking.provider.id };
  }
  if (booking.provider.type === "STUDIO") {
    return { targetType: "studio", targetId: booking.provider.id };
  }
  throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
}

function isAdminUser(user: Pick<UserProfile, "roles">): boolean {
  return user.roles.includes(AccountType.ADMIN) || user.roles.includes(AccountType.SUPERADMIN);
}

function dedupeTagIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function throwTagValidation(field: "publicTagIds" | "privateTagIds", message: string): never {
  throw new AppError("Validation error", 400, "VALIDATION_ERROR", {
    fieldErrors: { [field]: message },
  });
}

async function resolveValidatedReviewTags(input: {
  publicTagIds?: string[];
  privateTagIds?: string[];
}): Promise<{ all: ReviewTagLite[] }> {
  const publicTagIds = dedupeTagIds(input.publicTagIds ?? []);
  const privateTagIds = dedupeTagIds(input.privateTagIds ?? []);

  if (publicTagIds.length > REVIEW_PUBLIC_TAGS_MAX) {
    throwTagValidation("publicTagIds", `You can select up to ${REVIEW_PUBLIC_TAGS_MAX} public tags`);
  }
  if (privateTagIds.length > REVIEW_PRIVATE_TAGS_MAX) {
    throwTagValidation("privateTagIds", `You can select up to ${REVIEW_PRIVATE_TAGS_MAX} private tags`);
  }

  const requestedIds = Array.from(new Set([...publicTagIds, ...privateTagIds]));
  if (requestedIds.length === 0) return { all: [] };

  const tags = await prisma.reviewTag.findMany({
    where: {
      id: { in: requestedIds },
      isActive: true,
    },
    select: { id: true, type: true },
  });

  const tagById = new Map(tags.map((tag) => [tag.id, tag] as const));

  for (const tagId of publicTagIds) {
    const tag = tagById.get(tagId);
    if (!tag) {
      throwTagValidation("publicTagIds", "One or more selected public tags are invalid");
    }
    if (tag.type !== "PUBLIC") {
      throwTagValidation("publicTagIds", "Selected tag does not belong to PUBLIC type");
    }
  }

  for (const tagId of privateTagIds) {
    const tag = tagById.get(tagId);
    if (!tag) {
      throwTagValidation("privateTagIds", "One or more selected private tags are invalid");
    }
    if (tag.type !== "PRIVATE") {
      throwTagValidation("privateTagIds", "Selected tag does not belong to PRIVATE type");
    }
  }

  const all: ReviewTagLite[] = [];
  for (const id of [...publicTagIds, ...privateTagIds]) {
    const tag = tagById.get(id);
    if (!tag) continue;
    all.push({ id: tag.id, type: tag.type });
  }

  return { all };
}

async function canViewerSeePrivateTags(input: {
  targetType: ReviewTargetType;
  targetId: string;
  currentUser?: Pick<UserProfile, "id" | "roles"> | null;
}): Promise<boolean> {
  const currentUser = input.currentUser;
  if (!currentUser) return false;
  if (isAdminUser(currentUser)) return true;
  if (input.targetType !== "provider") return false;

  const provider = await prisma.provider.findUnique({
    where: { id: input.targetId },
    select: {
      type: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  });

  if (!provider || provider.type !== "MASTER") return false;
  return provider.ownerUserId === currentUser.id || provider.masterProfile?.userId === currentUser.id;
}

export async function listReviewTags(): Promise<{
  publicTags: ReviewTagDto[];
  privateTags: ReviewTagDto[];
}> {
  const rows = await prisma.reviewTag.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { label: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      icon: true,
      type: true,
    },
  });

  const publicTags: ReviewTagDto[] = [];
  const privateTags: ReviewTagDto[] = [];

  for (const row of rows) {
    const dto = toReviewTagDto(row);
    if (row.type === "PUBLIC") {
      publicTags.push(dto);
    } else {
      privateTags.push(dto);
    }
  }

  return { publicTags, privateTags };
}

async function recalculateTargetRatings(
  tx: Prisma.TransactionClient,
  targetType: ReviewTargetType,
  targetId: string
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { targetType, targetId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingAvg = aggregate._avg.rating ?? 0;
  const ratingCount = aggregate._count._all ?? 0;

  await tx.provider.update({
    where: { id: targetId },
    data: {
      ratingAvg,
      ratingCount,
      rating: ratingAvg,
      reviews: ratingCount,
    },
  });

  if (targetType === "studio") {
    const studio = await tx.studio.findUnique({
      where: { providerId: targetId },
      select: { id: true },
    });
    if (!studio) {
      throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
    }
    await tx.studio.update({
      where: { id: studio.id },
      data: { ratingAvg, ratingCount },
    });
  }
}

async function resolveMasterRecipientIds(targetType: ReviewTargetType, targetId: string): Promise<string[]> {
  if (targetType !== "provider") return [];

  const provider = await prisma.provider.findUnique({
    where: { id: targetId },
    select: {
      type: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  });
  if (!provider || provider.type !== "MASTER") return [];

  const recipients = new Set<string>();
  if (provider.ownerUserId) recipients.add(provider.ownerUserId);
  if (provider.masterProfile?.userId) recipients.add(provider.masterProfile.userId);
  return Array.from(recipients);
}

async function createReviewCreatedNotifications(input: {
  bookingId: string | null;
  authorId: string;
  targetType: ReviewTargetType;
  targetId: string;
  rating: number;
  text: string | null;
}): Promise<void> {
  const recipients = await resolveMasterRecipientIds(input.targetType, input.targetId);
  const filteredRecipients = recipients.filter((recipientId) => recipientId !== input.authorId);
  if (filteredRecipients.length === 0) return;

  const textPart = input.text?.trim();
  const body = textPart && textPart.length > 0 ? `Rating ${input.rating}/5: ${textPart}` : `Rating ${input.rating}/5`;

  await prisma.notification.createMany({
    data: filteredRecipients.map((userId) => ({
      userId,
      type: NotificationType.BOOKING_CREATED,
      title: "New review",
      body,
      bookingId: input.bookingId,
    })),
  });
}

async function ensureMasterReviewAccess(review: {
  targetType: ReviewTargetType;
  targetId: string;
}, currentUserId: string): Promise<void> {
  if (review.targetType !== "provider") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const provider = await prisma.provider.findUnique({
    where: { id: review.targetId },
    select: {
      type: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
    },
  });

  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (provider.ownerUserId !== currentUserId && provider.masterProfile?.userId !== currentUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
}

export async function createReview(input: {
  currentUserId: string;
  bookingId: string;
  rating: number;
  text?: string;
  publicTagIds?: string[];
  privateTagIds?: string[];
  nowUtc?: Date;
}): Promise<ReviewDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { durationMin: true } },
      provider: { select: { id: true, type: true } },
    },
  });

  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }

  const isAllowed = canLeaveReview({
    booking,
    currentUserId: input.currentUserId,
    nowUtc: input.nowUtc ?? new Date(),
  });
  if (!isAllowed) {
    throw new AppError("Review not allowed", 403, "REVIEW_NOT_ALLOWED");
  }

  const target = requireReviewTarget(booking);
  const existing = await prisma.review.findUnique({
    where: { bookingId: input.bookingId },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("Review already exists", 409, "REVIEW_ALREADY_EXISTS");
  }

  const validatedTags = await resolveValidatedReviewTags({
    publicTagIds: input.publicTagIds,
    privateTagIds: input.privateTagIds,
  });

  let created: ReviewWithRelations;

  try {
    created = await prisma.$transaction(async (tx) => {
      if (target.targetType === "studio") {
        const studio = await tx.studio.findUnique({
          where: { providerId: target.targetId },
          select: { id: true },
        });
        if (!studio) {
          throw new AppError("Review target not found", 404, "REVIEW_TARGET_NOT_FOUND");
        }
      }

      const review = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          authorId: input.currentUserId,
          targetType: target.targetType,
          targetId: target.targetId,
          rating: input.rating,
          text: input.text?.trim() || null,
          tags:
            validatedTags.all.length > 0
              ? {
                  create: validatedTags.all.map((tag) => ({ tagId: tag.id })),
                }
              : undefined,
        },
        include: reviewInclude,
      });

      await recalculateTargetRatings(tx, target.targetType, target.targetId);
      return review;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Review already exists", 409, "REVIEW_ALREADY_EXISTS");
    }
    throw error;
  }

  try {
    await createReviewCreatedNotifications({
      bookingId: created.bookingId,
      authorId: created.authorId,
      targetType: created.targetType,
      targetId: created.targetId,
      rating: created.rating,
      text: created.text ?? null,
    });
  } catch (error) {
    console.error("Failed to create review notifications:", error);
  }

  return toReviewDto(created);
}

export async function listReviews(input: {
  targetType: ReviewTargetType;
  targetId: string;
  limit: number;
  offset: number;
  currentUser?: Pick<UserProfile, "id" | "roles"> | null;
}): Promise<ReviewDto[]> {
  const includePrivateTags = await canViewerSeePrivateTags({
    targetType: input.targetType,
    targetId: input.targetId,
    currentUser: input.currentUser ?? null,
  });

  const reviews = await prisma.review.findMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
    },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    skip: input.offset,
    include: reviewInclude,
  });
  return reviews.map((review) => toReviewDto(review, { includePrivateTags }));
}

export async function getReviewAvailabilityForBooking(input: {
  currentUserId: string;
  bookingId: string;
  nowUtc?: Date;
}): Promise<{ canLeave: boolean; reviewId: string | null; canDelete: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      clientUserId: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { durationMin: true } },
      review: { select: { id: true, authorId: true, replyText: true, repliedAt: true } },
    },
  });

  if (!booking) {
    throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");
  }

  if (booking.review) {
    const canDelete =
      booking.review.authorId === input.currentUserId &&
      !booking.review.replyText &&
      booking.review.repliedAt == null;
    return { canLeave: false, reviewId: booking.review.id, canDelete };
  }

  const canLeave = canLeaveReview({
    booking,
    currentUserId: input.currentUserId,
    nowUtc: input.nowUtc ?? new Date(),
  });
  return { canLeave, reviewId: null, canDelete: false };
}

export async function canLeaveReviewForBooking(input: {
  currentUserId: string;
  bookingId: string;
  nowUtc?: Date;
}): Promise<boolean> {
  const availability = await getReviewAvailabilityForBooking(input);
  return availability.canLeave;
}

export async function replyToReview(input: {
  reviewId: string;
  currentUserId: string;
  text: string;
  nowUtc?: Date;
}): Promise<ReviewDto> {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      replyText: true,
      repliedAt: true,
    },
  });

  if (!review) {
    throw new AppError("Review not found", 404, "NOT_FOUND");
  }

  await ensureMasterReviewAccess(review, input.currentUserId);

  if (review.replyText || review.repliedAt) {
    throw new AppError("Review already has a reply", 409, "CONFLICT");
  }

  const updated = await prisma.review.update({
    where: { id: review.id },
    data: {
      replyText: input.text.trim(),
      repliedAt: input.nowUtc ?? new Date(),
    },
    include: reviewInclude,
  });

  return toReviewDto(updated, { includePrivateTags: true });
}

export async function reportReview(input: {
  reviewId: string;
  currentUserId: string;
  comment: string;
  nowUtc?: Date;
}): Promise<ReviewDto> {
  const now = input.nowUtc ?? new Date();
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      reportedAt: true,
    },
  });

  if (!review) {
    throw new AppError("Review not found", 404, "NOT_FOUND");
  }

  await ensureMasterReviewAccess(review, input.currentUserId);

  if (review.reportedAt) {
    throw new AppError("Review already reported", 409, "CONFLICT");
  }

  const reportDeadline = new Date(review.createdAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (now > reportDeadline) {
    throw new AppError("Review report window expired", 409, "CONFLICT");
  }

  const updated = await prisma.review.update({
    where: { id: review.id },
    data: {
      reportComment: input.comment.trim(),
      reportedAt: now,
    },
    include: reviewInclude,
  });

  return toReviewDto(updated, { includePrivateTags: true });
}

export async function deleteReview(input: {
  reviewId: string;
  currentUser: Pick<UserProfile, "id" | "roles">;
}): Promise<{ id: string }> {
  const review = await prisma.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      authorId: true,
      targetType: true,
      targetId: true,
      replyText: true,
      repliedAt: true,
      reportedAt: true,
    },
  });

  if (!review) {
    throw new AppError("Review not found", 404, "NOT_FOUND");
  }

  const isAuthor = review.authorId === input.currentUser.id;
  const isAdmin = isAdminUser(input.currentUser);

  if (isAuthor) {
    if (review.replyText || review.repliedAt) {
      throw new AppError("Review cannot be deleted after master reply", 409, "CONFLICT");
    }
  } else if (isAdmin) {
    if (!review.reportedAt) {
      throw new AppError("Admin can delete only reported reviews", 409, "CONFLICT");
    }
  } else {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: review.id } });
    await recalculateTargetRatings(tx, review.targetType, review.targetId);
  });

  return { id: review.id };
}
