import { BookingStatus, ReviewTargetType, type Booking } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { createRng } from "./helpers/deterministic-rng";

const REVIEW_TEXTS: ReadonlyArray<string> = [
  "Очень понравилось — мастер внимательный, всё аккуратно. Запишусь ещё.",
  "Атмосфера в студии спокойная, работа сделана идеально. Спасибо!",
  "Хороший результат, держится без сколов уже 3 недели.",
  "Мастер предложил подходящий для меня вариант, не навязывал лишнего.",
  "Чисто, профессионально, по времени. Рекомендую.",
  "Чуть подождала на ресепшен, в остальном всё отлично.",
  "Всё устроило, цена соответствует уровню.",
];

const REPLY_TEXTS: ReadonlyArray<string> = [
  "Спасибо за отзыв! Будем рады видеть вас снова.",
  "Благодарим, нам очень приятно. До встречи!",
  "Спасибо, ваше мнение важно. Ждём в следующий раз!",
];

export async function seedReviews(args: { bookings: Booking[] }): Promise<number> {
  logSeed.section("Reviews");
  const rng = createRng("reviews-v1");
  const finished = args.bookings.filter((b) => b.status === BookingStatus.FINISHED);
  let count = 0;

  for (const booking of finished) {
    if (!rng.chance(0.7)) continue;
    if (!booking.clientUserId) continue;

    const rating = rng.int(3, 5);
    const text = rng.pick(REVIEW_TEXTS);
    const withReply = rng.chance(0.3);
    const reply = withReply ? rng.pick(REPLY_TEXTS) : null;

    // Review is unique by `bookingId`, so upsert on that — re-running won't
    // double-count and mutates rating/text in place.
    await prisma.review.upsert({
      where: { bookingId: booking.id },
      update: {
        rating,
        text,
        replyText: reply,
        repliedAt: reply ? new Date() : null,
      },
      create: {
        bookingId: booking.id,
        authorId: booking.clientUserId,
        targetType: ReviewTargetType.provider,
        targetId: booking.providerId,
        masterId: booking.providerId,
        rating,
        text,
        replyText: reply,
        repliedAt: reply ? new Date() : null,
      },
    });
    count++;
  }

  // Recompute Provider.ratingAvg / ratingCount across affected providers.
  const affectedProviders = Array.from(new Set(finished.map((b) => b.providerId)));
  for (const providerId of affectedProviders) {
    const agg = await prisma.review.aggregate({
      where: { masterId: providerId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.provider.update({
      where: { id: providerId },
      data: {
        ratingAvg: agg._avg.rating ?? 0,
        ratingCount: agg._count._all,
        rating: agg._avg.rating ?? 0,
        reviews: agg._count._all,
      },
    });
  }

  logSeed.ok(`${count} reviews created across ${affectedProviders.length} providers`);
  return count;
}
