import { prisma } from "@/lib/prisma";
import { AppError, resolveErrorCode } from "@/lib/api/errors";
import { ProviderType, Prisma } from "@prisma/client";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { dateFromKey } from "@/lib/schedule/time";
import { toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import {
  assertAcceptsNewClient,
  assertBookingWindow,
  stricterBookingWindow,
} from "@/lib/bookings/policy-enforcement";
import { buildPriorBookingsWhere } from "@/lib/bookings/prior-bookings-where";
import { assertNoTimeBlockConflict } from "@/lib/schedule/time-blocks";
import { normalizeOccupancyIds, resolveOccupancyProviderIds } from "@/lib/schedule/occupancy";
import type { BookingTx } from "@/lib/bookings/booking-transaction";
import { isStudioMasterActive } from "@/lib/studio/master-eligibility";
import { studioAcceptsBookings, STUDIO_NOT_ACCEPTING_MESSAGE } from "@/lib/studio/accepts-bookings";

/**
 * FIX-C6 (инв. #31) — клиент, которому позволено спрашивать про конфликт.
 *
 * Либо пуловый `prisma` (дешёвая предварительная проверка ДО транзакции), либо
 * `BookingTx` — транзакция booking-домена, открытая `bookingTransaction`, то
 * есть `Serializable` по построению. Обычный `Prisma.TransactionClient` сюда
 * НЕ годится намеренно: под Read Committed повторная проверка не даёт ничего
 * сверх внешней (обе транзакции читают «пусто» и обе коммитятся), а выглядит
 * защитой. Раньше это утверждение держал регексп по исходнику; теперь —
 * компилятор.
 */
type ConflictCheckClient = typeof prisma | BookingTx;

export type BookingCoreContext = {
  provider: {
    id: string;
    type: ProviderType;
    ownerUserId: string | null;
    timezone: string;
    studioId: string | null;
    autoConfirmBookings: boolean;
    bufferBetweenBookingsMin: number;
  };
  service: {
    id: string;
    providerId: string;
    title: string | null;
    name: string;
    isEnabled: boolean;
    isActive: boolean;
    durationMin: number;
    baseDurationMin: number | null;
    price: number;
    basePrice: number | null;
    effectivePrice: number;
  };
  master: {
    id: string;
    type: ProviderType;
    studioId: string | null;
    timezone: string;
    bufferBetweenBookingsMin: number;
    autoConfirmBookings: boolean;
  } | null;
  resolvedMasterProviderId: string | null;
  durationMin: number;
  startAtUtc: Date;
  endAtUtc: Date;
  bufferMin: number;
  shouldAutoConfirm: boolean;
};

function parseSlotStartAtUtc(slotLabel: string, timezone: string): Date | null {
  const normalized = slotLabel.trim();
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!match) return null;

  const date = dateFromKey(match[1]);
  if (!date) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return toUtcFromLocalDateTime(date, hours, minutes, timezone);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

/**
 * LOGIC-01 — скоуп поиска конфликтов: «время мастера — это время мастера».
 *
 * Раньше предикат ключевался ПАРОЙ `(providerId, masterProviderId)`, а один и
 * тот же мастер имеет брони под ДВУМЯ разными `providerId`: через личный
 * профиль (`providerId = мастер`, `/api/public/bookings` при этом мастеров
 * студии не отсекает — проверено на HEAD) и через студийный кабинет
 * (`providerId = провайдер студии`, `masterProviderId = мастер`). Множества не
 * пересекались, поэтому студийный админ создавал бронь поверх существующей
 * **без всякой гонки**, а Serializable этого не ловил: транзакции читают
 * непересекающиеся строки, цикла зависимостей нет, обе коммитятся.
 *
 * Правило «время мастера — это время мастера» в проекте уже принято: на нём
 * стоят `TimeBlock` (`time-blocks.ts:50-53`, ключ только `masterId`) и
 * генератор слотов (`schedule/usecases.ts:310-315`). Этот предикат приводится
 * к ним же, а не изобретает пятое определение конфликта.
 *
 * ⚠️ Скоуп строится как **надмножество** прежнего, а не как замена. Для брони
 * БЕЗ назначенного мастера (`masterProviderId = null`, студийная бронь на
 * кабинет целиком) прежний широкий клоз `{ providerId }` сохранён: он ловил
 * пересечение с любой бронью студии, и сузить его — отдельное продуктовое
 * решение, а не побочный эффект фикса скоупа.
 *
 * STUDIO-MASTER-PROFILES (этап 1): «время мастера» — это время ЧЕЛОВЕКА, а не
 * одного профиля. У мастера может быть личный профиль и профиль в студии, и
 * занятое в одном недоступно в другом. Поэтому скоуп строится по набору
 * профилей человека (`occupancyIds`, `schedule/occupancy.ts`), и набор —
 * обязательный параметр: вызывающий, который про него забудет, не
 * скомпилируется. Набор получают `resolveConflictOccupancyIds` (ниже) или
 * `resolveOccupancyProviderIds` тем же клиентом, что и сама проверка.
 */
export function buildConflictScopeWhere(input: {
  providerId: string;
  masterProviderId: string | null;
  occupancyIds: readonly string[];
}) {
  const masterKey = input.masterProviderId ?? input.providerId;
  const keys = normalizeOccupancyIds([masterKey, ...input.occupancyIds]);
  const orClauses: Array<Record<string, unknown>> = [
    // исполнитель — любой профиль этого человека, под каким бы providerId ни была бронь
    { masterProviderId: { in: keys } },
    // бронь без назначенного мастера: занят сам профиль
    { masterProviderId: null, providerId: { in: keys } },
  ];
  if (!input.masterProviderId) {
    orClauses.push({ providerId: input.providerId });
  }
  return { OR: orClauses };
}

/**
 * Набор профилей с общей занятостью для проверки пересечений: профили человека,
 * который ИСПОЛНЯЕТ запись (`masterProviderId ?? providerId`). Читает тем же
 * клиентом, что и проверка, — внутри транзакции это часть её набора чтения.
 */
export function resolveConflictOccupancyIds(
  db: ConflictCheckClient,
  input: { providerId: string; masterProviderId: string | null },
): Promise<string[]> {
  return resolveOccupancyProviderIds(db, input.masterProviderId ?? input.providerId);
}

/**
 * LOGIC-17 — ВРЕМЕННОЕ окно поиска конфликтов (дополняет `buildConflictScopeWhere`,
 * который задаёт скоуп «чьё это время»).
 *
 * Без него запрос забирает ВСЮ историю броней мастера. Помимо стоимости, внутри
 * Serializable это ставит predicate-lock на всю историю: любая параллельная
 * запись брони того же мастера — даже на будущий год — становится кандидатом на
 * `P2034` и получает ложный 409 `SLOT_CONFLICT`. Частота ложных конфликтов
 * растёт линейно с историей, то есть дефект просыпается тем сильнее, чем дольше
 * живёт кабинет.
 *
 * Границы буферизованы так же, как их потом сравнивает `overlaps`: предикат БД
 * и предикат в памяти обязаны отбирать одно и то же множество, иначе сужение
 * запроса начнёт терять конфликты.
 */
export function buildConflictWindowWhere(input: {
  startAtUtc: Date;
  endAtUtc: Date;
  bufferMin: number;
}) {
  const bufferedStart = input.bufferMin
    ? shiftMinutes(input.startAtUtc, -input.bufferMin)
    : input.startAtUtc;
  const bufferedEnd = input.bufferMin
    ? shiftMinutes(input.endAtUtc, input.bufferMin)
    : input.endAtUtc;
  return {
    startAtUtc: { not: null, lt: bufferedEnd },
    endAtUtc: { not: null, gt: bufferedStart },
  } as const;
}

export async function ensureNoConflicts(
  db: ConflictCheckClient,
  input: {
    providerId: string;
    masterProviderId: string | null;
    startAtUtc: Date;
    endAtUtc: Date;
    bufferMin: number;
  }
): Promise<void> {
  const occupancyIds = await resolveConflictOccupancyIds(db, input);
  const conflicts = await db.booking.findMany({
    where: {
      ...buildConflictScopeWhere({ ...input, occupancyIds }),
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      ...buildConflictWindowWhere(input),
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) => {
    if (!b.startAtUtc || !b.endAtUtc) return false;
    const itemStart = input.bufferMin ? shiftMinutes(b.startAtUtc, -input.bufferMin) : b.startAtUtc;
    const itemEnd = input.bufferMin ? shiftMinutes(b.endAtUtc, input.bufferMin) : b.endAtUtc;
    return overlaps(input.startAtUtc, input.endAtUtc, itemStart, itemEnd);
  });

  if (conflict) {
    throw new AppError(
      "Кто-то записался первым на это время. Выберите другое — обычно есть много вариантов.",
      409,
      "SLOT_CONFLICT"
    );
  }

  // FIX-TIMEBLOCK-ENFORCEMENT-01: the same in-tx check must reject a booking
  // overlapping a studio/master TimeBlock — otherwise a direct API call (or a
  // TOCTOU race with a just-created block) lands inside blocked time. The owner
  // is the performing master's Provider.id: `masterProviderId` for a studio
  // booking, or `providerId` for a solo master (where they are the same id). A
  // studio-level booking with no chosen master falls back to `providerId`, which
  // matches no per-master block — correct (a block targets a specific master).
  await assertNoTimeBlockConflict(db, {
    masterProviderId: input.masterProviderId ?? input.providerId,
    startAtUtc: input.startAtUtc,
    endAtUtc: input.endAtUtc,
  });
}

function mapAvailabilityError(code?: string): { message: string; status: number } {
  switch (code) {
    case "DURATION_INVALID":
      return { message: "Проверьте длительность услуги.", status: 400 };
    case "SERVICE_REQUIRED":
      return { message: "Не указана услуга.", status: 400 };
    case "DATE_INVALID":
      return { message: "Проверьте дату.", status: 400 };
    case "RANGE_INVALID":
      return { message: "Проверьте выбранный период.", status: 400 };
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return { message: "Мастер не найден.", status: 404 };
    case "SERVICE_NOT_FOUND":
      return { message: "Услуга не найдена.", status: 404 };
    case "SERVICE_INVALID":
      return { message: "Этот мастер сейчас не оказывает выбранную услугу. Выберите другую.", status: 409 };
    default:
      return { message: "Не удалось проверить доступность окошка.", status: 500 };
  }
}

export async function resolveBookingCore(input: {
  providerId: string;
  serviceId: string;
  masterProviderId: string | null;
  // BOOKING-WIDGET-FOUNDATION-A: null for guest bookings (no signed-in
  // user). When null, owner-self-booking + acceptNewClients-priors checks
  // are skipped — guest is always treated as a new client.
  clientUserId: string | null;
  startAtUtc?: Date;
  endAtUtc?: Date | null;
  slotLabel?: string;
}): Promise<BookingCoreContext> {
  const [provider, service] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: input.providerId },
      select: {
        id: true,
        type: true,
        ownerUserId: true,
        isPublished: true,
        studioPaused: true,
        timezone: true,
        studioId: true,
        autoConfirmBookings: true,
        bufferBetweenBookingsMin: true,
        // BOOKING-WIDGET-A: policy fields surfaced here so the
        // `assertBookingWindow` + `assertAcceptsNewClient` guards below
        // can validate before the slot-check + transaction.
        minBookingHoursAhead: true,
        maxBookingDaysAhead: true,
        acceptNewClients: true,
      },
    }),
    prisma.service.findUnique({
      where: { id: input.serviceId },
      select: {
        id: true,
        providerId: true,
        title: true,
        name: true,
        isEnabled: true,
        isActive: true,
        durationMin: true,
        baseDurationMin: true,
        price: true,
        basePrice: true,
      },
    }),
  ]);

  if (!provider) {
    throw new AppError("Мастер не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }

  if (!service.isEnabled || !service.isActive) {
    throw new AppError("Услуга недоступна.", 400, "SERVICE_DISABLED");
  }

  if (
    input.clientUserId &&
    provider.ownerUserId &&
    provider.ownerUserId === input.clientUserId
  ) {
    throw new AppError("Нельзя записаться на собственную услугу.", 400, "FORBIDDEN");
  }

  // STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): услуги
  // профилей не смешиваются. Запись оформляется только в профиле, которому
  // принадлежит услуга: студийная — через студию (запись студии), своя — через
  // личный профиль мастера (личная запись). Раньше профиль мастера студии
  // принимал и студийные услуги (FIX-D1: личная страница без своих услуг
  // продавала студийные), и такая запись становилась ЛИЧНОЙ — без `studioId`,
  // невидимой журналу, выручке и клиентам студии.
  if (service.providerId !== provider.id) {
    if (provider.type === ProviderType.MASTER && provider.studioId && service.providerId === provider.studioId) {
      throw new AppError(
        "Эта услуга оказывается в студии — запишитесь на странице студии.",
        400,
        "SERVICE_NOT_BELONGS_TO_PROVIDER",
      );
    }
    throw new AppError("Этот мастер не оказывает выбранную услугу. Выберите другую.", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const resolvedMasterProviderId =
    provider.type === ProviderType.MASTER ? provider.id : input.masterProviderId ?? null;

  const master =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? await prisma.provider.findUnique({
          where: { id: resolvedMasterProviderId },
          select: {
            id: true,
            type: true,
            studioId: true,
            ownerUserId: true,
            studioPaused: true,
            timezone: true,
            bufferBetweenBookingsMin: true,
            autoConfirmBookings: true,
            // BOOKING-WINDOW-STRICTER: окно записи мастера участвует наравне со студийным.
            minBookingHoursAhead: true,
            maxBookingDaysAhead: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && resolvedMasterProviderId !== provider.id && !master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  if (master && provider.type === ProviderType.STUDIO && master.studioId !== provider.id) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  // STUDIO-MASTER-OWN-BOOKINGS-01: связь `MasterService` (и её цена/длительность)
  // нужна только для услуги СТУДИИ. После проверки выше услуга студии бывает
  // только на поверхности самой студии; своя услуга мастера бронируется как у
  // соло-мастера.
  const needsOverride = provider.type === ProviderType.STUDIO;

  // STUDIO-HIDDEN-MASTER-SERVICES: услуга СТУДИИ бронируется, только пока
  // студия принимает записи. Скрытая студия записей не принимает; её мастер —
  // только личные на свои услуги.
  if (needsOverride && !studioAcceptsBookings(provider)) {
    throw new AppError(STUDIO_NOT_ACCEPTING_MESSAGE, 409, "STUDIO_NOT_ACCEPTING_BOOKINGS");
  }
  const override =
    resolvedMasterProviderId && needsOverride
      ? await prisma.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: resolvedMasterProviderId,
              serviceId: service.id,
            },
          },
          select: {
            isEnabled: true,
            priceOverride: true,
            durationOverrideMin: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && needsOverride) {
    if (!override || override.isEnabled === false) {
      throw new AppError("Мастер не оказывает выбранную услугу.", 409, "SERVICE_INVALID");
    }
    // STUDIO-PAUSE-SPLIT-01: услугу СТУДИИ оказывает только мастер, активный в
    // студии (инв. #24). Пауза в студии больше не скрывает личную страницу
    // мастера, поэтому без этой проверки мастер на паузе продавал бы студийные
    // услуги со своей страницы. Со стороны студии проверки не было вовсе:
    // виджет лишь не показывал такого мастера, а прямой запрос проходил.
    const performer = provider.type === ProviderType.MASTER ? provider : master;
    if (!performer || !isStudioMasterActive(performer)) {
      throw new AppError("Мастер сейчас не принимает записи в студии.", 409, "MASTER_NOT_ACTIVE");
    }
  }

  const durationMin = override?.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new AppError("Проверьте длительность услуги.", 400, "DURATION_INVALID");
  }

  const effectivePrice = override?.priceOverride ?? service.basePrice ?? service.price;
  if (!Number.isInteger(effectivePrice) || effectivePrice < 0) {
    throw new AppError("Проверьте цену услуги.", 400, "VALIDATION_ERROR");
  }

  const startAtUtc =
    input.startAtUtc ??
    (input.slotLabel ? parseSlotStartAtUtc(input.slotLabel, provider.timezone) : null);
  if (!isValidDate(startAtUtc)) {
    throw new AppError("Проверьте дату и время начала.", 400, "DATE_INVALID");
  }

  const endAtUtc = input.endAtUtc ?? new Date(startAtUtc.getTime() + durationMin * 60 * 1000);
  if (!isValidDate(endAtUtc) || endAtUtc <= startAtUtc) {
    throw new AppError("Проверьте дату и время окончания.", 400, "DATE_INVALID");
  }

  // BOOKING-WIDGET-A: provider policy enforcement. Three rules surfaced
  // here so direct API callers can't bypass the slot-UI filters:
  //   1. `minBookingHoursAhead` → BOOKING_TOO_SOON (400)
  //   2. `maxBookingDaysAhead` → BOOKING_TOO_FAR (400)
  //   3. `acceptNewClients=false` + zero priors → NEW_CLIENTS_CLOSED (403)
  // For (3) we only count when the flag is off, avoiding an extra query
  // on the common path. Counted bookings exclude REJECTED/CANCELLED/
  // NO_SHOW since those don't represent an existing relationship.
  const now = new Date();
  // BOOKING-WINDOW-STRICTER (решение владельца 2026-09-24): на услугу студии —
  // более строгое из окон студии и мастера (мастер загружен выше). Своя услуга
  // мастера — окно его профиля.
  assertBookingWindow(startAtUtc, stricterBookingWindow(provider, master), now);
  if (!provider.acceptNewClients) {
    // BOOKING-WIDGET-FOUNDATION-A: guests (clientUserId === null) are
    // treated as new clients with zero priors — `acceptNewClients=false`
    // therefore blocks them just like a brand-new signed-in user. This
    // is the same UX intent as the existing rule, no special carve-out
    // for anonymous bookings.
    const priorBookingsCount = input.clientUserId
      ? await prisma.booking.count({
          // FIX-7: never emit `{ masterProviderId: undefined }` inside the OR —
          // that made Prisma drop the key → `{}` → a match-all clause that
          // counted the client's bookings platform-wide, bypassing the gate.
          where: buildPriorBookingsWhere({
            clientUserId: input.clientUserId,
            providerId: provider.id,
            masterProviderId: resolvedMasterProviderId ?? null,
          }),
        })
      : 0;
    assertAcceptsNewClient(provider, priorBookingsCount);
  }

  const availabilityProviderId = resolvedMasterProviderId ?? provider.id;
  const availabilityTimezone = master?.timezone ?? provider.timezone;
  const availability = await listAvailabilitySlotsPaginated(
    availabilityProviderId,
    service.id,
    durationMin,
    {
      fromKey: toLocalDateKey(startAtUtc, availabilityTimezone),
      limit: 1,
    }
  );
  if (!availability.ok) {
    const mapped = mapAvailabilityError(availability.code);
    const code = resolveErrorCode(availability.code, "INTERNAL_ERROR");
    throw new AppError(mapped.message, mapped.status, code);
  }

  const hasSlot = availability.data.slots.some((slot) => {
    const slotStart = toDate(slot.startAtUtc);
    const slotEnd = toDate(slot.endAtUtc);
    if (!slotStart || !slotEnd) return false;
    return slotStart.getTime() === startAtUtc.getTime() && slotEnd.getTime() === endAtUtc.getTime();
  });
  if (!hasSlot) {
    throw new AppError(
      "Кто-то записался первым на это время. Выберите другое — обычно есть много вариантов.",
      409,
      "SLOT_CONFLICT"
    );
  }

  const bufferSource =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? master?.bufferBetweenBookingsMin
      : provider.bufferBetweenBookingsMin;
  const bufferMin = normalizeBufferMinutes(bufferSource);

  // STUDIO-AUTOCONFIRM-01: решает флаг ИСПОЛНИТЕЛЯ. Переключатель
  // «Автоподтверждение» пишет `autoConfirmBookings` в строку мастера — и из
  // правил мастера в кабинете студии, и из кабинета самого мастера, — а здесь
  // флаг читался только у соло-мастера. Итог: у студии переключатель ничего не
  // делал, каждая запись висела неподтверждённой (без напоминаний клиенту),
  // пока мастер не откроет кабинет. Буфер уже берётся у исполнителя тем же
  // правилом (см. выше).
  const shouldAutoConfirm =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? Boolean(master?.autoConfirmBookings)
      : provider.type === ProviderType.MASTER && provider.autoConfirmBookings;

  return {
    provider,
    service: {
      ...service,
      effectivePrice,
    },
    master,
    resolvedMasterProviderId,
    durationMin,
    startAtUtc,
    endAtUtc,
    bufferMin,
    shouldAutoConfirm,
  };
}
