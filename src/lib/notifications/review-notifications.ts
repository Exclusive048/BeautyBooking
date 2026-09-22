import { MembershipStatus, NotificationType, Prisma, StudioRole } from "@prisma/client";
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
  if (review.targetType === "studio") {
    await notifyStudioReviewLeft(review);
    return;
  }
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

function buildReviewLeftText(review: ReviewWithRelations): { title: string; body: string } {
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
  return { title: "Новый отзыв", body };
}

/**
 * STUDIO-REVIEWS-NOTIFY-01 — отзыв на визит в студию (цель `studio`).
 *
 * Раньше `notifyReviewLeft` для такой цели выходил сразу: о новом отзыве не
 * узнавал никто — ни владелец и администраторы студии, ни мастер, оказавший
 * услугу. Адресаты: владелец студии + активные OWNER/ADMIN + мастер
 * (`Review.masterId`). `bookingId` в строке уведомления — чтобы центр отнёс
 * его к каналу студии у администратора и к каналу мастера у мастера.
 */
async function notifyStudioReviewLeft(review: ReviewWithRelations): Promise<void> {
  const studio = await prisma.studio.findUnique({
    where: { providerId: review.targetId },
    select: { id: true, provider: { select: { ownerUserId: true } } },
  });
  if (!studio) return;

  const [admins, master] = await Promise.all([
    prisma.studioMembership.findMany({
      where: {
        studioId: studio.id,
        status: MembershipStatus.ACTIVE,
        roles: { hasSome: [StudioRole.OWNER, StudioRole.ADMIN] },
      },
      select: { userId: true },
    }),
    review.masterId
      ? prisma.provider.findUnique({
          where: { id: review.masterId },
          select: { ownerUserId: true, masterProfile: { select: { userId: true } } },
        })
      : Promise.resolve(null),
  ]);

  const studioRecipients = new Set<string>(admins.map((item) => item.userId));
  if (studio.provider.ownerUserId) studioRecipients.add(studio.provider.ownerUserId);
  const masterUserId = master?.ownerUserId ?? master?.masterProfile?.userId ?? null;

  const { title, body } = buildReviewLeftText(review);
  const payloadJson = {
    reviewId: review.id,
    bookingId: review.bookingId,
    authorId: review.authorId,
    rating: review.rating,
  };

  const deliveries: Array<Promise<unknown>> = [];
  for (const userId of studioRecipients) {
    if (userId === review.authorId) continue;
    deliveries.push(
      deliverNotification({
        userId,
        type: NotificationType.REVIEW_LEFT,
        title,
        body,
        payloadJson,
        bookingId: review.bookingId,
        pushUrl: "/cabinet/studio/reviews",
        telegramText: buildTelegramText(title, body),
      }),
    );
  }
  if (masterUserId && !studioRecipients.has(masterUserId) && masterUserId !== review.authorId) {
    deliveries.push(
      deliverNotification({
        userId: masterUserId,
        type: NotificationType.REVIEW_LEFT,
        title,
        body,
        payloadJson,
        bookingId: review.bookingId,
        pushUrl: "/cabinet/master/reviews",
        telegramText: buildTelegramText(title, body),
      }),
    );
  }
  await Promise.all(deliveries);
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
