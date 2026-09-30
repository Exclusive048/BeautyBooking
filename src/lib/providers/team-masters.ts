import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { normalizeBufferMinutes } from "@/lib/bookings/booking-core";
import { publicBookingHorizonDays } from "@/lib/bookings/policy-enforcement";
import { prisma } from "@/lib/prisma";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

/**
 * Мастер для публичной команды студии и виджета записи. Необязательные поля
 * есть только у мастеров студии (у соло-мастера ответ — он сам).
 */
export type PublicTeamMaster = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  publicUsername: string | null;
  tagline?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  portfolioProviderId?: string | null;
  serviceIds: string[];
  bufferMin: number;
  bookingHorizonDays?: number;
};

/**
 * 29.09 доработки · 13 — команда провайдера для публичных поверхностей: тело
 * бывшего `GET /api/providers/[id]/masters`, вынесенное в сервис, чтобы SSR
 * страницы студии читал его вызовом функции, а не HTTP-запросом к себе. Роут
 * остался тонкой обёрткой — его читает виджет записи студии в браузере; ответ
 * роута и SSR — один и тот же массив.
 *
 * Не найден или не опубликован — 404 `PROVIDER_NOT_FOUND`.
 */
export async function listPublicTeamMasters(providerKey: string): Promise<PublicTeamMaster[]> {
  const provider = await resolveProviderBySlugOrId({
    key: providerKey,
    select: {
      id: true,
      type: true,
      name: true,
      publicUsername: true,
      isPublished: true,
      bufferBetweenBookingsMin: true,
    },
  });

  if (!provider || !provider.isPublished) {
    throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (provider.type === ProviderType.MASTER) {
    // EXP-024: include the master's own enabled service ids so consumers
    // (studio booking wizard) can list only masters who perform the
    // selected service. A solo master performs its own catalog services.
    const soloServices = await prisma.service.findMany({
      where: { providerId: provider.id, isEnabled: true },
      select: { id: true },
    });
    return [
      {
        id: provider.id,
        name: provider.name,
        publicUsername: provider.publicUsername,
        serviceIds: soloServices.map((s) => s.id),
        // PACKAGE-STUDIO-SAME-MASTER-BUFFER: normalized exactly as
        // resolveBookingCore will normalize it, so the wizard's cursor
        // and the create-side validator agree at the boundary.
        bufferMin: normalizeBufferMinutes(provider.bufferBetweenBookingsMin),
      },
    ];
  }

  const masters = await prisma.provider.findMany({
    // STUDIO-PAUSE-SPLIT-01: команда студии — мастера, АКТИВНЫЕ в студии
    // (приглашение принято, не на паузе). Личная видимость мастера здесь не
    // решает: скрывший свою страницу продолжает работать в студии.
    where: { studioId: provider.id, type: ProviderType.MASTER, ...STUDIO_ACTIVE_MASTER_WHERE },
    // EXP-024: `masterServices` (enabled MasterService rows) is the source
    // of truth for which team master performs which service. The booking
    // wizard filters its picker on this — so it never lists (and never
    // fires `/availability` for → no 409 `SERVICE_INVALID`) masters who
    // aren't assigned to the chosen service.
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      publicUsername: true,
      isPublished: true,
      tagline: true,
      ratingAvg: true,
      ratingCount: true,
      bufferBetweenBookingsMin: true,
      maxBookingDaysAhead: true,
      visibleSlotDays: true,
      masterServices: {
        where: { isEnabled: true },
        select: { serviceId: true },
      },
      // STUDIO-MASTER-PROFILES (этап 4): у профиля мастера в студии своей
      // страницы нет — карточка ведёт на ЛИЧНУЮ страницу того же человека,
      // если она открыта.
      owner: {
        select: {
          masterProfile: {
            select: { provider: { select: { id: true, publicUsername: true, isPublished: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return masters.map((m) => {
    const personal = m.owner?.masterProfile?.provider ?? null;
    const personalOpen = personal && personal.id !== m.id && personal.isPublished ? personal : null;
    return {
      id: m.id,
      name: m.name,
      // STUDIO-BOOKING-BANNER: аватар мастера в шапке и на шаге выбора мастера
      // (вырезан сервером по сохранённой области — CROP-PUBLIC-01).
      avatarUrl: m.avatarUrl,
      // Ссылка на личную страницу — только если мастер её не скрыл: иначе
      // карточка команды вела бы на 404. STUDIO-MASTER-PROFILES: у профиля в
      // студии страницы нет — ссылка на личную страницу того же человека.
      publicUsername: m.isPublished ? m.publicUsername : personalOpen?.publicUsername ?? null,
      tagline: m.tagline,
      ratingAvg: m.ratingAvg,
      ratingCount: m.ratingCount,
      portfolioProviderId: m.isPublished ? m.id : personalOpen?.id ?? null,
      serviceIds: m.masterServices.map((s) => s.serviceId),
      // PACKAGE-STUDIO-SAME-MASTER-BUFFER: the same normalization the
      // create-side `resolveBookingCore` applies — the package wizard's
      // same-master cursor must match the validator exactly.
      bufferMin: normalizeBufferMinutes(m.bufferBetweenBookingsMin),
      // 29.09 доработки · 03: сколько дней вперёд виджет студии показывает
      // у этого мастера (его окно записи и «Сколько окошек вперёд»).
      bookingHorizonDays: publicBookingHorizonDays({
        maxBookingDaysAhead: m.maxBookingDaysAhead,
        visibleSlotDays: m.visibleSlotDays,
      }),
    };
  });
}
