import { ProviderType, SubscriptionScope } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import type { PlanTier } from "@/lib/billing/features";
import * as cache from "@/lib/cache/cache";
import { withSingleFlight } from "@/lib/cache/single-flight";
import { isProviderFavorited } from "@/lib/favorites/get-favorites";
import {
  getMasterHeroExtras,
  resolveProviderPlanTier,
  type AvailabilityHint,
} from "@/lib/master/public-profile-view.service";
import { isProviderOwner } from "@/lib/providers/owner";
import { canonicalPublicProviderKey } from "@/lib/providers/resolve-public-provider";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { findReviewableBookingId } from "@/lib/reviews/service";
import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * MOBILE-B3 — то, что веб показывает на странице провайдера сверх
 * `GET /api/providers/{key}`: данные шапки мастера (`getMasterHeroExtras` —
 * тот же код, что у `/u/{username}`) и флаги зрителя (избранное, «это моя
 * страница», запись, на которую можно оставить отзыв). Тело
 * `GET /api/public/providers/{key}/overview`.
 */

/** Часть ответа, одинаковая для всех зрителей (кэшируется). */
export type PublicProviderOverviewBase = {
  /** Тариф владельца: `FREE` / `PRO` / `PREMIUM` (кольцо и бейдж PREMIUM); `null` — неизвестен. */
  planTier: PlanTier | null;
  /** Мастер: месяцев на платформе (с `Provider.createdAt`). Студия: `null`. */
  experienceMonths: number | null;
  /**
   * Мастер: ближайшее окошко — `today` + `HH:MM` или `later` + `YYYY-MM-DD`,
   * оба в поясе салона (`provider.timezone`); `none` — за 8 дней нет.
   * Студия: `null` (у веба такого блока нет).
   */
  availability: AvailabilityHint | null;
  /**
   * Мастер в студии: студия. `id` — `Provider.id` студии, то же значение, что
   * `ProviderProfileDto.studioId` (booking-flow carve-out правила 12: запись в
   * студию идёт по этому id). `publicUsername` — `null`, если страница студии
   * не публична. Независимый мастер и студия — `null`.
   */
  studio: { id: string; name: string; publicUsername: string | null } | null;
};

/** Флаги зрителя. Гостю — всё `false` / `null`. Не кэшируются. */
export type PublicProviderViewer = {
  isFavorited: boolean;
  /** Зритель — владелец профиля: запись ему не предлагать (сервер её отклонит). */
  isOwner: boolean;
  /**
   * CUID записи зрителя у этого провайдера, на которую сейчас можно оставить
   * отзыв (самая свежая), — для `POST /api/reviews`. Это собственная запись
   * вошедшего зрителя, а не чужой внутренний id (booking-flow carve-out
   * правила 12, как `booking.id` в ответе создания записи).
   */
  reviewableBookingId: string | null;
};

export type PublicProviderOverview = PublicProviderOverviewBase & { viewer: PublicProviderViewer };

/**
 * Окошко «ближайшая запись» — тот же 8-дневный зонд по расписанию, что веб
 * делает на каждый просмотр страницы мастера. Здесь он кэшируется на минуту на
 * провайдера: подсказка, а не слот (слоты отдаёт `/slots` без кэша), поэтому
 * минутная задержка после чужой записи допустима. День салона — в ключе, чтобы
 * «сегодня» не пережило полночь.
 */
const OVERVIEW_CACHE_TTL_SECONDS = 60;

export async function getPublicProviderOverview(input: {
  providerKey: string;
  viewerUserId: string | null;
}): Promise<PublicProviderOverview> {
  const provider = await resolveProviderBySlugOrId({
    key: await canonicalPublicProviderKey(input.providerKey),
    select: { id: true, type: true, timezone: true },
    requirePublished: true,
  });
  if (!provider) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  const [base, viewer] = await Promise.all([
    loadOverviewBase(provider),
    input.viewerUserId
      ? loadViewerFlags(provider.id, input.viewerUserId)
      : Promise.resolve<PublicProviderViewer>({ isFavorited: false, isOwner: false, reviewableBookingId: null }),
  ]);
  return { ...base, viewer };
}

type OverviewProvider = { id: string; type: ProviderType; timezone: string };

async function loadOverviewBase(provider: OverviewProvider): Promise<PublicProviderOverviewBase> {
  const salonDayKey = toLocalDateKey(new Date(), provider.timezone);
  const cacheKey = `publicProviderOverview:v1:${provider.id}:${salonDayKey}`;
  const cached = await cache.get<PublicProviderOverviewBase>(cacheKey);
  if (cached) return cached;

  return withSingleFlight<PublicProviderOverviewBase>({
    lockKey: `sf:${cacheKey}`,
    read: () => cache.get<PublicProviderOverviewBase>(cacheKey),
    compute: async () => {
      const computed = await computeOverviewBase(provider);
      await cache.set(cacheKey, computed, OVERVIEW_CACHE_TTL_SECONDS);
      return computed;
    },
  });
}

async function computeOverviewBase(provider: OverviewProvider): Promise<PublicProviderOverviewBase> {
  if (provider.type === ProviderType.MASTER) {
    const extras = await getMasterHeroExtras(provider.id, provider.timezone);
    return {
      planTier: extras.planTier,
      experienceMonths: extras.experienceMonths,
      availability: extras.availability,
      studio: extras.studio,
    };
  }
  return {
    planTier: await resolveProviderPlanTier(provider.id, SubscriptionScope.STUDIO),
    experienceMonths: null,
    availability: null,
    studio: null,
  };
}

/** Те же три проверки, что делают секции веб-страницы для вошедшего зрителя. */
async function loadViewerFlags(providerId: string, userId: string): Promise<PublicProviderViewer> {
  const [isFavorited, isOwner, reviewableBookingId] = await Promise.all([
    isProviderFavorited(userId, providerId),
    isProviderOwner(providerId, userId),
    findReviewableBookingId({ currentUserId: userId, providerId }),
  ]);
  return { isFavorited, isOwner, reviewableBookingId };
}
