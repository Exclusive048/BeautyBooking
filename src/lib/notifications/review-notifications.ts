import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications/delivery";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";

const reviewInclude = {
  booking: { select: { id: true, clientUserId: true } },
  author: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} as const;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

function resolveUserName(input: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fallback: string;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  const parts = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(" ");
  return input.fallback;
}

function buildTelegramText(title: string, body: string): string {
  return `${title}\n${body}`;
}

export async function loadReviewWithRelations(reviewId: string): Promise<ReviewWithRelations | null> {
  // `findUnique` can't take arbitrary `where` clauses, so we use
  // `findFirst` with the unique id plus the active-only filter to
  // defensively skip notifications about soft-deleted reviews.
  return prisma.review.findFirst({
    where: { id: reviewId, ...ACTIVE_REVIEW_FILTER },
    include: reviewInclude,
  });
}

export async function notifyReviewLeft(review: ReviewWithRelations): Promise<void> {
  if (review.targetType !== "provider") return;

  const provider = await prisma.provider.findUnique({
    where: { id: review.targetId },
    select: {
      type: true,
      ownerUserId: true,
      masterProfile: { select: { userId: true } },
      name: true,
    },
  });
  if (!provider || provider.type !== "MASTER") return;

  const masterUserId = provider.ownerUserId ?? provider.masterProfile?.userId ?? null;
  if (!masterUserId) return;

  const authorLabel = resolveUserName({
    displayName: review.author.displayName,
    firstName: review.author.firstName,
    lastName: review.author.lastName,
    fallback: "Клиент",
  });

  const textPart = review.text?.trim();
  const body = textPart
    ? `Новый отзыв от ${authorLabel}: ${review.rating}/5 — ${textPart}`
    : `Новый отзыв от ${authorLabel}: ${review.rating}/5.`;
  const title = "Новый отзыв";

  await deliverNotification({
    userId: masterUserId,
    type: NotificationType.REVIEW_LEFT,
    title,
    body,
    payloadJson: {
      reviewId: review.id,
      bookingId: review.bookingId,
      authorId: review.authorId,
      rating: review.rating,
    },
    pushUrl: "/cabinet/master/reviews",
    telegramText: buildTelegramText(title, body),
  });
}

export async function notifyReviewReplied(review: ReviewWithRelations): Promise<void> {
  const clientUserId = review.authorId;
  if (!clientUserId) return;

  const title = "Ответ на отзыв";
  const body = "Мастер ответил на ваш отзыв.";

  await deliverNotification({
    userId: clientUserId,
    type: NotificationType.REVIEW_REPLIED,
    title,
    body,
    payloadJson: {
      reviewId: review.id,
      bookingId: review.bookingId,
    },
    pushUrl: "/cabinet/bookings",
    telegramText: buildTelegramText(title, body),
  });
}
