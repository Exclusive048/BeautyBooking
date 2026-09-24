import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { listProviderCards } from "@/lib/providers/queries";
import { mapProviderProfile, mapProviderService } from "@/lib/providers/mappers";
import type { ProviderCardDto, ProviderProfileDto } from "@/lib/providers/dto";
import { ProviderType } from "@prisma/client";
import { getStudioBanner } from "@/lib/studios/banner";
import { getProviderSuperpowerBadges } from "@/lib/reviews/badges";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { studioAcceptsBookings } from "@/lib/studio/accepts-bookings";

// AUDIT (section 5):
// - Superpower badges are computed server-side from public review tags.
export async function listProviders(input?: {
  cursor?: string | null;
  limit?: number;
}): Promise<{ providers: ProviderCardDto[]; nextCursor: string | null }> {
  const result = await listProviderCards(input);
  return {
    providers: result.items,
    nextCursor: result.nextCursor,
  };
}

export async function getProviderProfile(providerKey: string): Promise<ProviderProfileDto> {
  const provider = await resolveProviderBySlugOrId({
    key: providerKey,
    select: {
      id: true,
      type: true,
      studioId: true,
      studioPaused: true,
      studio: { select: { isPublished: true } },
      name: true,
      avatarUrl: true,
      tagline: true,
      description: true,
      publicUsername: true,
      isPublished: true,
      rating: true,
      reviews: true,
      priceFrom: true,
      address: true,
      district: true,
      categories: true,
      availableToday: true,
      timezone: true,
      socialVk: true,
      socialInstagram: true,
      cancellationDeadlineHours: true,
      discountRule: { select: { isEnabled: true } },
      geoLat: true,
      geoLng: true,
      services: {
        where: { isEnabled: true },
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
          // FIX-R2-04-C: attached category label + order for booking-list grouping.
          globalCategory: { select: { name: true, orderIndex: true } },
        },
      },
    },
  });

  if (!provider) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }
  if (!provider.isPublished) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  const profile = mapProviderProfile(provider);
  profile.hotSlotsEnabled = provider.discountRule?.isEnabled ?? false;
  if (provider.type === ProviderType.STUDIO) {
    const banner = await getStudioBanner(provider.id);
    profile.bannerUrl = banner?.url ?? null;
    profile.bannerCrop = banner?.crop ?? null;
    return profile;
  }

  if (provider.type === ProviderType.MASTER) {
    // FIX-D1 (F7): у мастера СТУДИИ услуг в собственности нет — они принадлежат
    // провайдеру студии, а связь идёт через `MasterService`. Селект выше читает
    // только прямое владение (`Service.providerId = provider.id`), поэтому у
    // такого мастера список приходил ПУСТЫМ, секция «Услуги» рендерила
    // заголовок без карточек, и CTA записи не появлялся вовсе — то есть
    // собственная страница мастера не могла продать (SMOKE-01 · F7,
    // подтверждено SMOKE-02).
    //
    // Замер, назвавший причину: у Марины `Service.providerId = master` → 0
    // строк, `MasterService` → 8, и все восемь услуг принадлежат провайдеру
    // студии. У соло-мастера ровно наоборот (5 собственных, 0 связей). То есть
    // дефект был в ОБЛАСТИ ЗАПРОСА, а не в условии рендера: секция честно
    // рисовала то, что ей дали.
    //
    // Решение владельца (FIX-D1): личная страница мастера студии — ПРОДАЮЩАЯ
    // поверхность. Модель данных это уже предполагает — бронь с неё получает
    // `studioId = null`, не видна журналу студии и не управляется ею (инв. #45).
    //
    // Запрос делается только при `studioId != null`: у соло-мастера связей нет
    // по построению, и лишнее обращение к БД на каждый публичный профиль не
    // окупается.
    //
    // STUDIO-MASTER-OWN-BOOKINGS-01: если у мастера студии есть СОБСТВЕННЫЕ
    // услуги, личная страница продаёт их сама (запись идёт мимо студии,
    // `studioId = null`), а на студийные ведёт ссылка «записаться через
    // студию». Своих услуг нет — прежнее поведение FIX-D1: показываем
    // студийные, запись через студию.
    if (provider.studioId) {
      if (provider.studioPaused || !studioAcceptsBookings(provider.studio)) {
        // STUDIO-PAUSE-SPLIT-01: мастер на паузе в студии. Личная страница
        // по-прежнему открыта (пауза больше её не гасит), но продаёт только
        // СВОИ услуги: студийных нет, ссылки «записаться через студию» — тоже,
        // иначе клиент дошёл бы до отказа `MASTER_NOT_ACTIVE` в конце записи.
        // STUDIO-HIDDEN-MASTER-SERVICES: так же — у мастера скрытой студии: она
        // записей не принимает, мастер — только личные записи на свои услуги.
        profile.studioId = null;
        profile.sellsOwnServices = true;
      } else if (profile.services.length > 0) {
        profile.sellsOwnServices = true;
      } else {
        profile.services = await loadStudioMasterServices(provider.id);
      }
    }
    profile.superpowerBadges = await getProviderSuperpowerBadges(provider.id);
  }

  return profile;
}

/**
 * Услуги мастера студии — через `MasterService`, с персональными
 * переопределениями цены и длительности.
 *
 * Предикат тот же, что у каталога (`catalog.service.ts`): связь включена И сама
 * услуга включена и активна. Расхождение здесь означало бы, что карточка в
 * каталоге и профиль показывают разные наборы.
 */
async function loadStudioMasterServices(masterProviderId: string) {
  const links = await prisma.masterService.findMany({
    where: {
      masterProviderId,
      isEnabled: true,
      service: { isEnabled: true, isActive: true },
    },
    select: {
      priceOverride: true,
      durationOverrideMin: true,
      service: {
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
          globalCategory: { select: { name: true, orderIndex: true } },
        },
      },
    },
  });

  return links.map((link) =>
    mapProviderService({
      ...link.service,
      // Переопределения — это то, что мастер берёт за услугу лично; показывать
      // студийную цену там, где она перебита, значит обещать не ту сумму.
      price: link.priceOverride ?? link.service.price,
      durationMin: link.durationOverrideMin ?? link.service.durationMin,
    }),
  );
}
