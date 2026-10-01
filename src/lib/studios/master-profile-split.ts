import { Prisma, ProviderType, type PrismaClient } from "@prisma/client";
import { recalculateTargetRatings } from "@/lib/reviews/recalculate-ratings";

/**
 * STUDIO-MASTER-PROFILES (этап 4, решение владельца 2026-09-27) — разделение
 * мастера студии на ДВА профиля.
 *
 * Было: один `Provider` на человека — он и личный профиль (свои услуги,
 * страница, личные записи), и мастер в студии (`studioId` задан, студийные
 * услуги через `MasterService`, студийные записи, расписание, которое правит
 * студия). Стало: личный профиль P (тот, на который указывает `MasterProfile`,
 * `studioId = null`) и профиль в студии S — отдельная строка `Provider` того же
 * владельца с `studioId` студии и без `MasterProfile`. Время у человека одно:
 * занятость общая по всем его профилям (`schedule/occupancy.ts`).
 *
 * Этот модуль — перенос ДЕЙСТВУЮЩИХ мастеров студий (пост-деплой, идемпотентно:
 * разделённый мастер больше не кандидат — у личного профиля `studioId` пуст).
 * Новые вступления разделяются сразу при принятии приглашения
 * (`invites/service.ts`).
 *
 * Модуль без `server-only`-зависимостей и с клиентом БД параметром: его зовёт
 * `scripts/post-deploy.ts` обычным `tsx`, где `@/lib/prisma`, Redis и хранилище
 * недоступны. Поэтому:
 *  - расписание копируется строками (копия уже нормализованных данных в новую
 *    строку, кэша у которой ещё нет; у личного профиля расписание не меняется);
 *  - аватар студийного профиля — ссылка на аватар личного (физическая копия
 *    объекта требует хранилища); при смене личного аватара ссылка
 *    синхронизируется (`media/service.ts`);
 *  - «свободно сегодня» и снимок `freeSlotKeys` пересчитает плановый проход
 *    воркера (≤ 30 минут).
 *
 * Что переезжает в профиль студии — ровно студийное:
 *  - связи с услугами студии (`MasterService` по владельцу услуги);
 *  - записи студии (исполнитель) и записи «студийная услуга, оформленная на
 *    личной странице» — они становятся записями студии (решение владельца:
 *    «услуги не смешиваются»);
 *  - перерывы студии (`TimeBlock` с её `studioId`), заявки на расписание в эту
 *    студию, подписи исполнителя на фото студии, отзывы о визитах в студию
 *    (+ пересчёт рейтинга обоих профилей), студийные модель-офферы;
 *  - копии: имя, описание, аватар, настройки записи и расписание.
 * Личное остаётся на месте: свои услуги, пакеты, страница и адрес, портфолио,
 * личные записи и отзывы, CRM-карточки, подписки на горящие окошки, избранное.
 */

type Tx = Prisma.TransactionClient;

export type StudioMasterSplitResult = {
  personalId: string;
  studioProfileId: string;
  moved: {
    masterServices: number;
    studioBookings: number;
    personalSurfaceStudioBookings: number;
    timeBlocks: number;
    scheduleRequests: number;
    performerPhotos: number;
    studioReviews: number;
    studioVisitReviews: number;
    modelOffers: number;
  };
};

/** Кандидаты: личные профили (есть `MasterProfile`), всё ещё несущие студию. */
export async function listUnsplitStudioMasters(db: PrismaClient): Promise<string[]> {
  const rows = await db.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      studioId: { not: null },
      ownerUserId: { not: null },
      masterProfile: { isNot: null },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => row.id);
}

export async function splitAllStudioMastersWith(
  db: PrismaClient,
): Promise<{ split: StudioMasterSplitResult[]; failed: Array<{ personalId: string; error: string }> }> {
  const split: StudioMasterSplitResult[] = [];
  const failed: Array<{ personalId: string; error: string }> = [];
  for (const personalId of await listUnsplitStudioMasters(db)) {
    try {
      const result = await db.$transaction((tx) => splitStudioMasterProfileTx(tx, personalId), {
        timeout: 60_000,
        maxWait: 10_000,
      });
      if (result) split.push(result);
    } catch (error) {
      // Один мастер — одна транзакция: сбой не оставляет его наполовину
      // разделённым и не мешает остальным. Повторный деплой подхватит его снова.
      failed.push({ personalId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { split, failed };
}

/**
 * Разделяет одного мастера. `null` — нечего делать (уже разделён или не
 * мастер студии). Вся работа — в переданной транзакции.
 */
export async function splitStudioMasterProfileTx(
  tx: Tx,
  personalId: string,
): Promise<StudioMasterSplitResult | null> {
  const personal = await tx.provider.findUnique({
    where: { id: personalId },
    select: {
      id: true,
      type: true,
      studioId: true,
      ownerUserId: true,
      studioPaused: true,
      masterProfile: { select: { id: true } },
    },
  });
  if (
    !personal ||
    personal.type !== ProviderType.MASTER ||
    !personal.studioId ||
    !personal.ownerUserId ||
    !personal.masterProfile
  ) {
    return null;
  }

  const studioProviderId = personal.studioId;
  const studioRow = await tx.studio.findUnique({
    where: { providerId: studioProviderId },
    select: { id: true },
  });
  const studioRowId = studioRow?.id ?? null;

  // 1–2. Профиль в студии: копия лица, правил записи и расписания.
  const studioProfileId = await createStudioMasterProfileTx(tx, {
    personalId,
    studioProviderId,
    studioPaused: personal.studioPaused,
  });
  if (!studioProfileId) return null;

  // 3. Связи с услугами студии.
  const masterServices = await tx.masterService.updateMany({
    where: { masterProviderId: personalId, service: { providerId: studioProviderId } },
    data: { masterProviderId: studioProfileId, masterId: studioProfileId },
  });
  if (studioRowId) {
    await tx.masterService.updateMany({
      where: { masterProviderId: studioProfileId, studioId: null },
      data: { studioId: studioRowId },
    });
  }

  // 4. Записи студии, которые исполнял мастер.
  const studioBookings = await tx.booking.updateMany({
    where: {
      masterProviderId: personalId,
      OR: [{ providerId: studioProviderId }, ...(studioRowId ? [{ studioId: studioRowId }] : [])],
    },
    data: { masterProviderId: studioProfileId, masterId: studioProfileId },
  });
  if (studioRowId) {
    await tx.booking.updateMany({
      where: { masterProviderId: studioProfileId, providerId: studioProviderId, studioId: null },
      data: { studioId: studioRowId },
    });
  }

  // 5. Студийная услуга, оформленная на ЛИЧНОЙ странице (до этапа 2 так было
  //    можно) — это запись студии. Пакетные компоненты не трогаем: пакет — одно
  //    целое, а его поверхность — личный профиль.
  const studioServiceIds = (
    await tx.service.findMany({ where: { providerId: studioProviderId }, select: { id: true } })
  ).map((row) => row.id);
  const misattributed = studioServiceIds.length
    ? await tx.booking.findMany({
        where: { providerId: personalId, serviceId: { in: studioServiceIds }, bookingPackageId: null },
        select: { id: true },
      })
    : [];
  const misattributedIds = misattributed.map((row) => row.id);
  if (misattributedIds.length > 0) {
    await tx.booking.updateMany({
      where: { id: { in: misattributedIds } },
      data: {
        providerId: studioProviderId,
        studioId: studioRowId,
        masterProviderId: studioProfileId,
        masterId: studioProfileId,
      },
    });
  }

  // 6. Перерывы студии у мастера.
  const timeBlocks = studioRowId
    ? await tx.timeBlock.updateMany({
        where: { masterId: personalId, studioId: studioRowId },
        data: { masterId: studioProfileId },
      })
    : { count: 0 };

  // 7. Заявки на расписание в эту студию. Заявка легаси-формата несёт id
  //    шаблонов личного профиля — одобрить её для нового профиля нельзя.
  const scheduleRequests = studioRowId
    ? await tx.scheduleChangeRequest.updateMany({
        where: { providerId: personalId, studioId: studioRowId },
        data: { providerId: studioProfileId },
      })
    : { count: 0 };
  if (studioRowId) {
    await tx.scheduleChangeRequest.updateMany({
      where: {
        providerId: studioProfileId,
        status: "PENDING",
        NOT: { payloadJson: { path: ["format"], equals: "EDITOR_V1" } },
      },
      data: { status: "REJECTED" },
    });
  }

  // 8. Подписи исполнителя на фото студии.
  const performerPhotos = await tx.portfolioItem.updateMany({
    where: { performerId: personalId, masterId: studioProviderId },
    data: { performerId: studioProfileId },
  });

  // 9. Отзывы о визитах в студию — рейтинг профиля в студии (решение владельца).
  const studioReviews = await tx.review.updateMany({
    where: { targetType: "studio", targetId: studioProviderId, masterId: personalId },
    data: { masterId: studioProfileId },
  });
  // 9б. Отзыв о записи студии, адресованный ЛИЧНОМУ профилю (шаги 4–5 уже
  //     перенесли такие записи на поверхность студии).
  const retargetedReviews = await retargetStudioVisitReviewsTx(tx, {
    personalId,
    studioProfileId,
    studioProviderId,
    studioRowId,
  });

  // 10. Горящие окошки по студийным услугам на личном профиле больше не нужны:
  //     горящие окошки профиля — по его своим услугам.
  if (studioServiceIds.length > 0) {
    await tx.hotSlot.deleteMany({
      where: { providerId: personalId, serviceId: { in: studioServiceIds } },
    });
  }

  // 11. Студийные модель-офферы (через связь с услугой студии).
  const modelOffers = await tx.modelOffer.updateMany({
    where: { masterId: personalId, masterServiceId: { not: null } },
    data: { masterId: studioProfileId },
  });

  // 12. Личный профиль выходит из студии.
  await tx.provider.update({
    where: { id: personalId },
    data: { studioId: null, studioPaused: false },
    select: { id: true },
  });

  // 13. Рейтинги: у личного ушли студийные отзывы, у профиля в студии — пришли.
  await recalculateTargetRatings(tx, { targetType: "provider", targetId: personalId, masterId: null });
  await recalculateTargetRatings(tx, { targetType: "provider", targetId: studioProfileId, masterId: null });
  if (retargetedReviews > 0) {
    await recalculateTargetRatings(tx, {
      targetType: "studio",
      targetId: studioProviderId,
      masterId: studioProfileId,
    });
  }

  return {
    personalId,
    studioProfileId,
    moved: {
      masterServices: masterServices.count,
      studioBookings: studioBookings.count,
      personalSurfaceStudioBookings: misattributedIds.length,
      timeBlocks: timeBlocks.count,
      scheduleRequests: scheduleRequests.count,
      performerPhotos: performerPhotos.count,
      studioReviews: studioReviews.count,
      studioVisitReviews: retargetedReviews,
      modelOffers: modelOffers.count,
    },
  };
}

/**
 * Отзыв о записи НА ПОВЕРХНОСТИ СТУДИИ, адресованный личному профилю мастера, —
 * это отзыв о визите в студию: приложение само создаёт такие отзывы с целью
 * «студия» (цель — поверхность записи, `reviews/service.ts`). Адресованные
 * мастеру остались от сидов и от записей «студийная услуга на личной странице»
 * (шаг 5). Решение владельца — отзывы о визитах в студию живут только в профиле
 * студии, поэтому цель становится студией, а исполнитель — профилем мастера в
 * студии (рейтинг профиля в студии их видит через `masterId`,
 * `reviews/review-scope.ts`). Идемпотентно: повторный вызов ничего не находит.
 */
export async function retargetStudioVisitReviewsTx(
  tx: Tx,
  input: { personalId: string; studioProfileId: string; studioProviderId: string; studioRowId: string | null },
): Promise<number> {
  const result = await tx.review.updateMany({
    where: studioVisitReviewsOfPersonalWhere(input.personalId, input.studioProviderId),
    data: {
      targetType: "studio",
      targetId: input.studioProviderId,
      studioId: input.studioRowId,
      masterId: input.studioProfileId,
    },
  });
  return result.count;
}

/** Отзывы о визитах в студию, адресованные личному профилю: одно условие на перенос и сверку. */
function studioVisitReviewsOfPersonalWhere(personalId: string, studioProviderId: string): Prisma.ReviewWhereInput {
  return {
    targetType: "provider",
    targetId: personalId,
    booking: { is: { providerId: studioProviderId } },
  };
}

/**
 * Пост-деплой: то же правило для УЖЕ разделённых мастеров. Первая версия
 * разделения переносила только отзывы о записях шага 5, и отзывы о визитах в
 * студию, адресованные мастеру, остались в личном рейтинге. Пара «личный
 * профиль ↔ профиль в студии» выводится из владельца; на чистых данных — ноль
 * транзакций (сначала дешёвый подсчёт).
 */
export async function reconcileStudioVisitReviewsWith(
  db: PrismaClient,
): Promise<{ retargeted: number; failed: Array<{ studioProfileId: string; error: string }> }> {
  const studioProfiles = await db.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      studioId: { not: null },
      ownerUserId: { not: null },
      masterProfile: { is: null },
    },
    select: { id: true, studioId: true, owner: { select: { masterProfile: { select: { providerId: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  let retargeted = 0;
  const failed: Array<{ studioProfileId: string; error: string }> = [];
  for (const profile of studioProfiles) {
    const personalId = profile.owner?.masterProfile?.providerId ?? null;
    const studioProviderId = profile.studioId;
    if (!personalId || !studioProviderId) continue;
    const pending = await db.review.count({ where: studioVisitReviewsOfPersonalWhere(personalId, studioProviderId) });
    if (pending === 0) continue;
    try {
      retargeted += await db.$transaction(
        async (tx) => {
          const studioRow = await tx.studio.findUnique({
            where: { providerId: studioProviderId },
            select: { id: true },
          });
          const count = await retargetStudioVisitReviewsTx(tx, {
            personalId,
            studioProfileId: profile.id,
            studioProviderId,
            studioRowId: studioRow?.id ?? null,
          });
          await recalculateTargetRatings(tx, { targetType: "provider", targetId: personalId, masterId: null });
          await recalculateTargetRatings(tx, {
            targetType: "studio",
            targetId: studioProviderId,
            masterId: profile.id,
          });
          return count;
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (error) {
      failed.push({ studioProfileId: profile.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { retargeted, failed };
}

/** Поля профиля, которые профиль в студии наследует от личного. */
const PERSONAL_PROFILE_COPY_SELECT = {
  ownerUserId: true,
  name: true,
  tagline: true,
  description: true,
  avatarUrl: true,
  categories: true,
  bufferBetweenBookingsMin: true,
  autoConfirmBookings: true,
  cancellationDeadlineHours: true,
  remindersEnabled: true,
  scheduleMode: true,
  fixedSlotTimes: true,
  minBookingHoursAhead: true,
  maxBookingDaysAhead: true,
  lateCancelAction: true,
  slotPrecision: true,
  visibleSlotDays: true,
  acceptNewClients: true,
  slotStepMin: true,
} satisfies Prisma.ProviderSelect;

/**
 * Создаёт профиль мастера в студии копией личного: лицо (имя, описание,
 * аватар-ссылка, категории), правила записи и расписание; место и пояс —
 * студии; страницы нет (`isPublished = false`, без адреса страницы — его
 * находят через студию). Единственный путь создания профиля в студии «с нуля»:
 * им пользуются и миграция действующих мастеров, и приём приглашения без
 * заготовки. `null` — нет личного профиля или студии.
 */
export async function createStudioMasterProfileTx(
  tx: Tx,
  input: { personalId: string; studioProviderId: string; studioPaused?: boolean },
): Promise<string | null> {
  const [personal, studioProvider] = await Promise.all([
    tx.provider.findUnique({ where: { id: input.personalId }, select: PERSONAL_PROFILE_COPY_SELECT }),
    tx.provider.findUnique({
      where: { id: input.studioProviderId },
      select: { type: true, timezone: true, cityId: true, address: true, district: true, geoLat: true, geoLng: true },
    }),
  ]);
  if (!personal || !personal.ownerUserId || !studioProvider || studioProvider.type !== ProviderType.STUDIO) {
    return null;
  }
  const { ownerUserId, ...copied } = personal;
  const created = await tx.provider.create({
    data: {
      ...copied,
      type: ProviderType.MASTER,
      ownerUserId,
      studioId: input.studioProviderId,
      studioPaused: input.studioPaused ?? false,
      isPublished: false,
      publicUsername: null,
      timezone: studioProvider.timezone,
      cityId: studioProvider.cityId,
      address: studioProvider.address,
      district: studioProvider.district,
      geoLat: studioProvider.geoLat,
      geoLng: studioProvider.geoLng,
    },
    select: { id: true },
  });
  await copyProviderScheduleTx(tx, input.personalId, created.id);
  return created.id;
}

/**
 * Заготовка мастера, которую студия завела под приглашение, становится
 * профилем принявшего в этой студии: владелец — он, страницы нет. Чего у
 * заготовки нет — берётся у личного профиля: расписание (копия текущего) и
 * аватар (ссылка). Имя заготовки оставляем — его вписала студия.
 */
export async function claimStagedStudioProfileTx(
  tx: Tx,
  input: { stagedId: string; personalId: string; ownerUserId: string },
): Promise<void> {
  const [staged, personal, stagedConfig, stagedPatterns] = await Promise.all([
    tx.provider.findUnique({ where: { id: input.stagedId }, select: { avatarUrl: true } }),
    tx.provider.findUnique({ where: { id: input.personalId }, select: { avatarUrl: true } }),
    tx.weeklyScheduleConfig.findUnique({ where: { providerId: input.stagedId }, select: { id: true } }),
    // SCHEDULE-PATTERNS-01: у заготовки может быть уже и график, не только неделя.
    tx.schedulePattern.count({ where: { providerId: input.stagedId } }),
  ]);
  await tx.provider.update({
    where: { id: input.stagedId },
    data: {
      ownerUserId: input.ownerUserId,
      studioPaused: false,
      isPublished: false,
      publicUsername: null,
      ...(staged?.avatarUrl ? {} : { avatarUrl: personal?.avatarUrl ?? null }),
    },
    select: { id: true },
  });
  if (!stagedConfig && stagedPatterns === 0) {
    await copyProviderScheduleTx(tx, input.personalId, input.stagedId);
  }
}

/**
 * Копия расписания профиля в новый профиль: шаблоны с перерывами (с именем дня
 * палитры), графики и особые дни (кроме прошедших) и легаси-перерывы. Неделя
 * (`WeeklyScheduleConfig`) копируется только у профиля БЕЗ графиков: у профиля
 * с графиком она история, и в копии без действующих периодов она ожила бы
 * (движок читает неделю у профиля без графика). id шаблонов перепривязываются.
 */
export async function copyProviderScheduleTx(tx: Tx, fromId: string, toId: string): Promise<void> {
  const templates = await tx.scheduleTemplate.findMany({
    where: { providerId: fromId },
    select: {
      id: true,
      name: true,
      label: true,
      startLocal: true,
      endLocal: true,
      color: true,
      scheduleMode: true,
      fixedSlotTimes: true,
      breaks: { select: { startLocal: true, endLocal: true, sortOrder: true, title: true } },
    },
  });
  const templateIdMap = new Map<string, string>();
  for (const template of templates) {
    const created = await tx.scheduleTemplate.create({
      data: {
        providerId: toId,
        name: template.name,
        label: template.label,
        startLocal: template.startLocal,
        endLocal: template.endLocal,
        color: template.color,
        scheduleMode: template.scheduleMode,
        fixedSlotTimes: template.fixedSlotTimes,
        breaks: { create: template.breaks.map((item) => ({ ...item })) },
      },
      select: { id: true },
    });
    templateIdMap.set(template.id, created.id);
  }
  const mapTemplate = (id: string | null) => (id ? templateIdMap.get(id) ?? null : null);

  const sourceHasPatterns =
    (await tx.schedulePattern.findFirst({ where: { providerId: fromId }, select: { id: true } })) !== null;
  const config = sourceHasPatterns
    ? null
    : await tx.weeklyScheduleConfig.findUnique({
        where: { providerId: fromId },
        select: {
          days: { select: { weekday: true, templateId: true, isActive: true, scheduleMode: true, fixedSlotTimes: true } },
        },
      });
  if (config) {
    await tx.weeklyScheduleConfig.create({
      data: {
        providerId: toId,
        days: {
          create: config.days.map((day) => ({
            weekday: day.weekday,
            templateId: mapTemplate(day.templateId),
            isActive: day.isActive,
            scheduleMode: day.scheduleMode,
            fixedSlotTimes: day.fixedSlotTimes,
          })),
        },
      },
      select: { id: true },
    });
  }

  // `ScheduleOverride.date` — полночь даты салона в UTC; вчерашних и раньше не
  // переносим (запас в сутки покрывает любой пояс).
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // SCHEDULE-PATTERNS-01: графики — действующий и будущие периоды (кончившиеся
  // новому профилю ни к чему). Даты графика — строки `YYYY-MM-DD`.
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const patterns = await tx.schedulePattern.findMany({
    where: { providerId: fromId, OR: [{ endsOn: null }, { endsOn: { gte: yesterdayKey } }] },
    select: {
      kind: true,
      cycleDays: true,
      anchorOn: true,
      startsOn: true,
      endsOn: true,
      days: { select: { position: true, templateId: true } },
    },
  });
  for (const pattern of patterns) {
    await tx.schedulePattern.create({
      data: {
        providerId: toId,
        kind: pattern.kind,
        cycleDays: pattern.cycleDays,
        anchorOn: pattern.anchorOn,
        startsOn: pattern.startsOn,
        endsOn: pattern.endsOn,
        days: {
          createMany: {
            data: pattern.days.map((day) => ({
              position: day.position,
              templateId: mapTemplate(day.templateId),
            })),
          },
        },
      },
      select: { id: true },
    });
  }
  const overrides = await tx.scheduleOverride.findMany({
    where: { providerId: fromId, date: { gte: yesterday } },
    select: {
      date: true,
      kind: true,
      isDayOff: true,
      isWorkday: true,
      scheduleMode: true,
      fixedSlotTimes: true,
      startLocal: true,
      endLocal: true,
      templateId: true,
      isActive: true,
      note: true,
      reason: true,
    },
  });
  if (overrides.length > 0) {
    await tx.scheduleOverride.createMany({
      data: overrides.map((item) => ({ ...item, providerId: toId, templateId: mapTemplate(item.templateId) })),
    });
  }

  const breaks = await tx.scheduleBreak.findMany({
    where: { providerId: fromId },
    select: { kind: true, dayOfWeek: true, date: true, startLocal: true, endLocal: true, note: true },
  });
  if (breaks.length > 0) {
    await tx.scheduleBreak.createMany({ data: breaks.map((item) => ({ ...item, providerId: toId })) });
  }
}
