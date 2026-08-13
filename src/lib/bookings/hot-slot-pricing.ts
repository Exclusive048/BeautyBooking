import { ProviderType, type Prisma } from "@prisma/client";

import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";

/**
 * FIX-C1 (фаза 3) · FIX-B18 — скидка горячего слота и анти-фрод стали ОДНИМ
 * вызовом.
 *
 * ## Что было
 *
 * `isHotSlotRebookBlocked` вызывался из двух путей создания брони
 * (`createBooking.ts`, легаси `createClientBooking.ts`), и **полнота этого
 * списка ничем не enforce'илась** — FIX-B18 записал это прямым текстом:
 * «третий путь создания брони унаследует горячие слоты без анти-фрода молча».
 * Сторож `hot-slots/anti-fraud.test.ts` проверяет сам предикат, а не его
 * вызывающих, поэтому увидеть пропуск было нечем.
 *
 * ## Почему не «сторож со списком путей»
 *
 * Список путей — это снова инвентарь, который протухает (класс дефекта #35/#38
 * и «пятой копии» LOGIC-01). Здесь есть форма сильнее: правило проверяется там,
 * где выдаётся **выгода**. Скидку невозможно получить, не пройдя проверку, —
 * они буквально одна функция, и `resolveDynamicHotSlotPricing` (примитив,
 * который считает цену) вне этого модуля разрешён только двум ЧИТАЮЩИМ
 * поверхностям, где брони не создаются.
 *
 * Следствие, которое и требовалось: путь создания брони, не зовущий этот
 * резолвер, скидки не даёт вовсе — значит и мошенничать нечем. Путь, который
 * скидку даёт, проходит анти-фрод по построению. Ни один список при этом не
 * ведётся.
 *
 * Сторож границы — `booking-hot-slot-chokepoint.test.ts`.
 *
 * ## Про сам анти-фрод (FIX-B18, дословно сохранено)
 *
 * `isHotSlotRebookBlocked` запрещает переброниросвать слот, который сам же
 * клиент отменил, если до начала оставалось ≤ `HOT_SLOT_REBOOK_BLOCK_HOURS`
 * = 24 ч. Схема злоупотребления: отменить свою бронь так, чтобы слот попал в
 * «горячее» окно, и тут же выкупить его со скидкой.
 */

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Возвращает цену услуги для создаваемой брони: базовую либо скидочную, если
 * слот горячий. Побочные эффекты — только отказы:
 *
 *   - клиент прислал `hotSlotId`, а слот уже не горячий → 409;
 *   - скидка положена, но клиент сам отменил этот слот менее суток назад → 409.
 */
export async function resolveBookingServicePrice(input: {
  db?: DbClient;
  /** `Booking.providerId` — скоуп поиска собственной отмены клиента. */
  providerId: string;
  providerType: ProviderType;
  /** Результат `resolveBookingCore` — исполнитель брони. */
  resolvedMasterProviderId: string | null;
  clientUserId: string;
  serviceId: string;
  basePrice: number;
  startAtUtc: Date;
  /** salon-tz: зона мастера, иначе провайдера (правило 17). */
  providerTimeZone: string;
  /** Клиент явно записывается на горячий слот. */
  hotSlotRequested: boolean;
  now?: Date;
}): Promise<number> {
  const db = input.db ?? prisma;

  // Чьё правило скидок применяется. Оба прежних сайта считали это выражение
  // по-своему (`resolvedMasterProviderId ?? (MASTER ? provider.id : null)` и
  // `MASTER ? provider.id : resolvedMasterProviderId`); они эквивалентны,
  // потому что `resolveBookingCore` для MASTER-провайдера кладёт в
  // `resolvedMasterProviderId` его же id. Здесь оно одно.
  const hotProviderId =
    input.resolvedMasterProviderId ??
    (input.providerType === ProviderType.MASTER ? input.providerId : null);
  if (!hotProviderId) return input.basePrice;

  const rule = await db.discountRule.findUnique({
    where: { providerId: hotProviderId },
    select: {
      isEnabled: true,
      triggerHours: true,
      discountType: true,
      discountValue: true,
      applyMode: true,
      minPriceFrom: true,
      serviceIds: true,
    },
  });

  const hotPricing = resolveDynamicHotSlotPricing({
    rule,
    slotStartAtUtc: input.startAtUtc,
    serviceId: input.serviceId,
    servicePrice: input.basePrice,
    providerTimeZone: input.providerTimeZone,
    now: input.now ?? new Date(),
  });

  if (input.hotSlotRequested && !hotPricing.isHot) {
    throw new AppError(
      "Этот горячий слот уже занят. Выберите другое время.",
      409,
      "BOOKING_CONFLICT",
    );
  }

  if (!hotPricing.isHot || hotPricing.discountedPrice === null) {
    return input.basePrice;
  }

  // Сужение запроса берёт ту же константу, что и решающий предикат, — иначе
  // окно выборки и окно решения могли бы разойтись молча (ровно так дефекты
  // этой кампании и жили).
  const cutoff = new Date(
    input.startAtUtc.getTime() - HOT_SLOT_REBOOK_BLOCK_HOURS * 60 * 60 * 1000,
  );
  const recentCancel = await db.booking.findFirst({
    where: {
      providerId: input.providerId,
      clientUserId: input.clientUserId,
      status: { in: ["REJECTED", "CANCELLED"] },
      startAtUtc: input.startAtUtc,
      cancelledAtUtc: { gt: cutoff },
    },
    select: { id: true, cancelledAtUtc: true },
  });
  if (recentCancel && isHotSlotRebookBlocked(recentCancel.cancelledAtUtc, input.startAtUtc)) {
    throw new AppError(
      "Повторная запись на тот же горячий слот после отмены недоступна. Выберите другое время.",
      409,
      "BOOKING_CONFLICT",
    );
  }

  return hotPricing.discountedPrice;
}
