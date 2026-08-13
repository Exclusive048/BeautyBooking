import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { BookingSource, MediaEntityType, ProviderType, Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { CREATE_BOOKING_RATE_LIMIT } from "@/lib/bookings/rateLimit";
import {
  buildCreateBookingIdempotencyKey,
  CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
  clearBookingIdempotency,
  resolveBookingIdempotency,
  storeBookingIdempotency,
} from "@/lib/bookings/idempotency";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { ensureNoConflicts, resolveBookingCore } from "@/lib/bookings/booking-core";
import { createBookingRow } from "@/lib/bookings/booking-row";
import { resolveBookingServicePrice } from "@/lib/bookings/hot-slot-pricing";
import { logInfo, logError } from "@/lib/logging/logger";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";
import { emitBookingCreatedSystemMessage } from "@/lib/chat/system-messages";

function mapPrismaBookingConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new AppError(
        "Это время уже занято. Пожалуйста, выберите другое окошко.",
        409,
        "BOOKING_CONFLICT"
      );
    }
  }
  return null;
}

export async function createBooking(input: {
  providerId: string;
  serviceId: string;
  masterProviderId: string | null;
  hotSlotId?: string | null;
  startAtUtc: Date;
  endAtUtc: Date | null;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null | undefined;
  silentMode?: boolean;
  referencePhotoAssetId?: string | null;
  bookingAnswers?: BookingAnswerPayload[] | null;
  /**
   * FIX-B15 — **обязателен и не nullable**, и это не ужесточение ради
   * аккуратности, а фиксация уже наступившего факта.
   *
   * BOOKING-WIDGET-FOUNDATION-A писал сюда `null` для гостя и разносил ключи
   * идемпотентности/лимита по телефону. RKN-FIX-02 это отменил: доказательству
   * согласия (152-ФЗ ст. 9) нужен субъект, поэтому оба вызывающих резолвят
   * пассивный профиль по телефону ДО создания брони и передают его id. С тех
   * пор `null` сюда не приходит — но тип продолжал его допускать, гостевая
   * ветка продолжала читаться как живая, и на этом прочтении был построен
   * ошибочный тезис FIX-B13 про «два бакета идемпотентности».
   *
   * Тип — единственная форма, которая это заканчивает: удалить ветку, оставив
   * `string | null`, значило бы превратить мёртвый код в будущий креш. Теперь
   * `null` не компилируется, поэтому и ветка не нужна, и «вернуть как было»
   * нельзя молча. Колонка `Booking.clientUserId` остаётся nullable — там живут
   * дореформенные строки, и это другой вопрос.
   */
  clientUserId: string;
  idempotencyKey?: string | null;
}): Promise<BookingDto> {
  const namespaceKey = input.clientUserId;
  let idempotencyKey: string | null = null;
  let idempotencyLockAcquired = false;
  if (input.idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(namespaceKey, input.idempotencyKey);
    const idempotency = await resolveBookingIdempotency({
      key,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
      userId: input.clientUserId,
    });
    if (idempotency.booking) return idempotency.booking;
    if (!idempotency.lockAcquired) {
      throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
    }
    idempotencyKey = key;
    idempotencyLockAcquired = true;
  }

  let createdBookingId: string | null = null;
  try {
    const allowed = await checkRateLimit(
      `rate:createBooking:${namespaceKey}`,
      CREATE_BOOKING_RATE_LIMIT.limit,
      CREATE_BOOKING_RATE_LIMIT.windowSeconds
    );
    if (!allowed) {
      throw new AppError("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
    }

    const {
      provider,
      service,
      master,
      resolvedMasterProviderId,
      durationMin,
      startAtUtc,
      endAtUtc,
      bufferMin,
      shouldAutoConfirm,
    } = await resolveBookingCore({
      providerId: input.providerId,
      serviceId: input.serviceId,
      masterProviderId: input.masterProviderId ?? null,
      clientUserId: input.clientUserId,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
    });

  const bookingExtras = await resolveBookingExtras({
    serviceId: service.id,
    clientUserId: input.clientUserId,
    referencePhotoAssetId: input.referencePhotoAssetId ?? null,
    bookingAnswers: input.bookingAnswers ?? null,
  });
  // FIX-C1 (фаза 3): скидка горячего слота и анти-фрод — один вызов. Прежде
  // здесь лежала копия ~50 строк, вторая такая же жила в `createClientBooking`,
  // и полнота этой пары ничем не проверялась (FIX-B18). Теперь получить
  // скидочную цену, не пройдя анти-фрод, невозможно: это одна функция.
  //
  // FIX-B15 — сохранённый факт: анти-фрод отрабатывает и у гостей. Здесь стоял
  // `if (input.clientUserId)` с комментарием «для гостей проверку пропускаем»,
  // который после RKN-FIX-02 описывал не поведение, а намерение четырёхмесячной
  // давности — гость получает пассивный профиль ДО создания брони.
  const bookedServicePrice = await resolveBookingServicePrice({
    providerId: input.providerId,
    providerType: provider.type,
    resolvedMasterProviderId,
    clientUserId: input.clientUserId,
    serviceId: service.id,
    basePrice: service.effectivePrice,
    startAtUtc,
    providerTimeZone: master?.timezone ?? provider.timezone,
    hotSlotRequested: Boolean(input.hotSlotId),
  });

  await ensureNoConflicts(prisma, {
    providerId: input.providerId,
    masterProviderId: resolvedMasterProviderId,
    startAtUtc,
    endAtUtc,
    bufferMin,
  });

  const transactionStartedAt = Date.now();
  let created;
  try {
    created = await prisma.$transaction(
      async (tx) => {
        await ensureNoConflicts(tx, {
          providerId: input.providerId,
          masterProviderId: resolvedMasterProviderId,
          startAtUtc,
          endAtUtc,
          bufferMin,
        });

        const created = await createBookingRow(tx, {
          data: {
            providerId: input.providerId,
            serviceId: service.id,
            masterProviderId: resolvedMasterProviderId,
            masterId: resolvedMasterProviderId ?? provider.id,
            startAtUtc,
            endAtUtc,
            slotLabel: input.slotLabel,
            clientName: input.clientName,
            clientPhone: input.clientPhone,
            comment: input.comment,
            silentMode: input.silentMode ?? false,
            referencePhotoAssetId: bookingExtras.referencePhotoAssetId,
            bookingAnswers: bookingExtras.bookingAnswers ?? undefined,
            clientUserId: input.clientUserId,
            // FIX-C1 · SMOKE-01 · F1 (побочная находка): это запись,
            // сделанная клиентом на сайте. Молчание здесь означало
            // `@default(MANUAL)`, и журнал студии подписывал её «Звонок».
            source: BookingSource.WEB,
            status: shouldAutoConfirm ? "CONFIRMED" : "PENDING",
            actionRequiredBy: shouldAutoConfirm ? null : "MASTER",
          },
          select: {
            id: true,
            slotLabel: true,
            status: true,
            providerId: true,
            masterProviderId: true,
            clientName: true,
            clientPhone: true,
            comment: true,
            silentMode: true,
            startAtUtc: true,
            endAtUtc: true,
            proposedStartAt: true,
            proposedEndAt: true,
            requestedBy: true,
            actionRequiredBy: true,
            changeComment: true,
            clientChangeRequestsCount: true,
            masterChangeRequestsCount: true,
            service: { select: { id: true, name: true } },
          },
        });

        await tx.bookingServiceItem.create({
          data: {
            bookingId: created.id,
            serviceId: service.id,
            titleSnapshot: service.title?.trim() || service.name,
            priceSnapshot: bookedServicePrice,
            durationSnapshotMin: durationMin,
          },
        });

        if (bookingExtras.referencePhotoAssetId) {
          await tx.mediaAsset.update({
            where: { id: bookingExtras.referencePhotoAssetId },
            data: {
              entityType: MediaEntityType.BOOKING,
              entityId: created.id,
            },
          });
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    const conflictError = mapPrismaBookingConflict(error);
    if (conflictError) throw conflictError;
    throw error;
  }
  const transactionMs = Date.now() - transactionStartedAt;
  logInfo("[booking:create] transaction complete", { transactionMs });
  createdBookingId = created.id;

  if (idempotencyKey && idempotencyLockAcquired) {
    await storeBookingIdempotency({
      key: idempotencyKey,
      bookingId: created.id,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
    });
  }

  if (shouldAutoConfirm) {
    await scheduleBookingRemindersSafe(created.id);
  }

  await invalidateSlotsForBookingRange({
    providerId: created.providerId,
    masterProviderId: created.masterProviderId ?? null,
    startAtUtc: created.startAtUtc,
    endAtUtc: created.endAtUtc,
  });

  const advisorMasterId =
    resolvedMasterProviderId ?? (provider.type === ProviderType.MASTER ? provider.id : null);
  if (advisorMasterId) {
    await invalidateAdvisorCache(advisorMasterId);
  }

  // Emit the BOOKING_CREATED system message into the chat. Idempotent via
  // (referencedBookingId, systemEventKey) unique constraint, so safe across
  // retries. Failures are non-fatal — chat decoration shouldn't block the
  // booking response.
  try {
    await emitBookingCreatedSystemMessage(created.id);
  } catch (error) {
    logError("Failed to emit booking system message (create)", {
      bookingId: created.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return toBookingDto(created);
  } catch (error) {
    if (idempotencyKey && idempotencyLockAcquired && !createdBookingId) {
      await clearBookingIdempotency(idempotencyKey);
    }
    throw error;
  }
}

