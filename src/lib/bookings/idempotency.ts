import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import {
  clearIdempotency,
  getIdempotencyRecord,
  setIdempotencyPending,
  setIdempotencyResult,
  type IdempotencyRecord,
} from "@/lib/idempotency/idempotency";

export const CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS = 600;

export function buildCreateBookingIdempotencyKey(userId: string, requestId: string): string {
  return `idempotency:createBooking:${userId}:${requestId}`;
}

const bookingSelect = {
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
} satisfies Prisma.BookingSelect;

async function loadBookingForIdempotency(
  userId: string,
  bookingId: string
): Promise<BookingDto | null> {
  // FIX-B15: раньше здесь была вторая ветка `clientUserId: null` для гостя, и
  // её комментарий ссылался на неймспейс по телефону — механику, отменённую
  // RKN-FIX-02. Оба вызывающих (`createBooking`, `createClientBooking`) передают
  // непустой id, и теперь это выражено типом, а не соглашением.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientUserId: userId },
    select: bookingSelect,
  });
  return booking ? toBookingDto(booking) : null;
}

/**
 * LOGIC-10: бюджет ожидания чужого результата был 3 × 100 мс ≈ 300 мс, а
 * победитель сидит в Serializable-транзакции, длительность которой сам код
 * логирует как `transactionMs` и которая под нагрузкой 300 мс превышает. То
 * есть проигравший штатно не дожидался и получал `DUPLICATE_REQUEST` — который
 * клиент показывал как «время занято». Бюджет поднят до порядка длительности
 * транзакции; клиентский повтор (`fetchRetryingDuplicates`) — второй слой, а
 * не замена этому.
 */
const IDEMPOTENCY_WAIT_ATTEMPTS = 10;
const IDEMPOTENCY_WAIT_DELAY_MS = 200;

async function waitForIdempotencyResult<T>(
  key: string,
  load: (entityId: string) => Promise<T | null>
): Promise<T | null> {
  for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
    const current = await getIdempotencyRecord(key);
    if (current?.status === "done") {
      const result = await load(current.entityId);
      if (result) return result;
    }
    await new Promise((resolve) => setTimeout(resolve, IDEMPOTENCY_WAIT_DELAY_MS));
  }
  return null;
}

/**
 * Lock-then-create поверх Redis: «уже сделано → отдать то же», «кто-то делает →
 * подождать», «никого → взять замок».
 *
 * LOGIC-09: параметризован загрузчиком, потому что второй потребитель —
 * пакетная бронь — хранит `bookingPackageId` и восстанавливает свой результат
 * по нему. Копировать сюда весь танец с замком ради другого типа результата
 * значило бы завести вторую реализацию идемпотентности рядом с инв. #28.
 */
export async function resolveIdempotency<T>(input: {
  key: string;
  ttlSeconds: number;
  load: (entityId: string) => Promise<T | null>;
}): Promise<{ result: T | null; lockAcquired: boolean }> {
  const existing = await getIdempotencyRecord(input.key);
  if (existing?.status === "done") {
    return { result: await input.load(existing.entityId), lockAcquired: false };
  }
  if (existing?.status === "pending") {
    return { result: await waitForIdempotencyResult(input.key, input.load), lockAcquired: false };
  }

  let acquired: boolean;
  try {
    acquired = await setIdempotencyPending(input.key, input.ttlSeconds);
  } catch {
    throw new AppError("Сервис временно недоступен. Попробуйте позже.", 503, "INTERNAL_ERROR");
  }
  if (!acquired) {
    return { result: await waitForIdempotencyResult(input.key, input.load), lockAcquired: false };
  }

  return { result: null, lockAcquired: true };
}

export async function resolveBookingIdempotency(input: {
  key: string;
  ttlSeconds: number;
  /** FIX-B15: не nullable — см. `loadBookingForIdempotency`. */
  userId: string;
}): Promise<{ booking: BookingDto | null; lockAcquired: boolean }> {
  const resolved = await resolveIdempotency({
    key: input.key,
    ttlSeconds: input.ttlSeconds,
    load: (bookingId) => loadBookingForIdempotency(input.userId, bookingId),
  });
  return { booking: resolved.result, lockAcquired: resolved.lockAcquired };
}

export async function storeBookingIdempotency(input: {
  key: string;
  bookingId: string;
  ttlSeconds: number;
}): Promise<void> {
  await setIdempotencyResult(input.key, input.bookingId, input.ttlSeconds);
}

/**
 * LOGIC-09 — пакетная бронь: ключ и TTL те же по смыслу, но кэшируется
 * `bookingPackageId`, а не одна бронь. Пакет — это N строк `Booking` в одной
 * транзакции, и повтор обязан вернуть ВЕСЬ пакет, иначе клиент увидит одну
 * бронь вместо купленных трёх.
 */
export function buildCreatePackageBookingIdempotencyKey(
  namespaceKey: string,
  requestId: string
): string {
  return `idempotency:createPackageBooking:${namespaceKey}:${requestId}`;
}

export async function storePackageIdempotency(input: {
  key: string;
  bookingPackageId: string;
  ttlSeconds: number;
}): Promise<void> {
  await setIdempotencyResult(input.key, input.bookingPackageId, input.ttlSeconds);
}

export async function clearBookingIdempotency(key: string): Promise<void> {
  await clearIdempotency(key);
}

export type { IdempotencyRecord };
