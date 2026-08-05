import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import {
  buildCreatePackageBookingIdempotencyKey,
  clearBookingIdempotency,
  resolveIdempotency,
  storePackageIdempotency,
} from "@/lib/bookings/idempotency";

/**
 * LOGIC-09 — идемпотентность пакетной брони (инв. #28).
 *
 * Пакетные `/book`-роуты заголовок `x-idempotency-key` не читали, а
 * `createSoloPackageBooking` / `createStudioPackageBooking` не имели такого
 * параметра вовсе — в отличие от `createBooking`. Дубля пакета это не
 * создавало: второй запрос упирался в `ensureNoConflicts` уже созданных
 * сиблингов. Но ответом был 409 «Это время уже занято. Пожалуйста, выберите
 * другое окошко» — то есть пользователь, чей пакет УСПЕШНО создан, шёл
 * выбирать другое время. Инвариант #28 на этих роутах просто не выполнялся.
 *
 * Кэшируется `bookingPackageId`, а не одна бронь: повтор обязан вернуть весь
 * пакет целиком (N броней), иначе клиент увидит одну запись вместо купленных
 * трёх. Замок, ожидание и TTL — общие с одиночной бронью
 * (`resolveIdempotency`), второй реализации идемпотентности рядом с инв. #28
 * быть не должно.
 */

export const CREATE_PACKAGE_IDEMPOTENCY_TTL_SECONDS = 600;

export type PackageBookingResult = {
  bookingPackageId: string;
  bookingIds: string[];
  totalKopeks: number;
};

/**
 * Восстановление результата по `bookingPackageId`. Ключ уже отнесён к
 * `clientUserId ?? guest:phone`, поэтому пересечений между пользователями не
 * бывает; фильтр по владельцу оставлен тем же, что у одиночной брони —
 * гостевой пакет читается только как гостевой.
 */
async function loadPackageForIdempotency(
  clientUserId: string | null,
  bookingPackageId: string,
): Promise<PackageBookingResult | null> {
  const pkg = await prisma.bookingPackage.findFirst({
    where: { id: bookingPackageId, clientUserId },
    select: {
      id: true,
      totalKopeks: true,
      bookings: { select: { id: true }, orderBy: { startAtUtc: "asc" } },
    },
  });
  if (!pkg) return null;
  return {
    bookingPackageId: pkg.id,
    bookingIds: pkg.bookings.map((booking) => booking.id),
    totalKopeks: pkg.totalKopeks,
  };
}

export type PackageIdempotencyGuard = {
  /** Готовый результат прошлой попытки — отдать как есть, ничего не создавая. */
  cached: PackageBookingResult | null;
  /** Ключ, под которым держится замок. `null` → идемпотентность не запрошена. */
  heldKey: string | null;
};

export async function beginPackageIdempotency(input: {
  idempotencyKey?: string | null;
  clientUserId: string | null;
  clientPhone: string;
}): Promise<PackageIdempotencyGuard> {
  if (!input.idempotencyKey) return { cached: null, heldKey: null };

  // Тот же неймспейс, что у одиночной брони: для гостя стабильный
  // идентификатор — телефон.
  const namespaceKey = input.clientUserId ?? `guest:${input.clientPhone}`;
  const key = buildCreatePackageBookingIdempotencyKey(namespaceKey, input.idempotencyKey);

  const resolved = await resolveIdempotency({
    key,
    ttlSeconds: CREATE_PACKAGE_IDEMPOTENCY_TTL_SECONDS,
    load: (bookingPackageId) => loadPackageForIdempotency(input.clientUserId, bookingPackageId),
  });

  if (resolved.result) return { cached: resolved.result, heldKey: null };
  if (!resolved.lockAcquired) {
    throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
  }
  return { cached: null, heldKey: key };
}

export async function completePackageIdempotency(
  heldKey: string | null,
  bookingPackageId: string,
): Promise<void> {
  if (!heldKey) return;
  await storePackageIdempotency({
    key: heldKey,
    bookingPackageId,
    ttlSeconds: CREATE_PACKAGE_IDEMPOTENCY_TTL_SECONDS,
  });
}

/**
 * Снятие замка при неудаче — иначе повтор после честной ошибки (занятый слот,
 * неверные данные) десять минут отвечал бы `DUPLICATE_REQUEST` вместо того,
 * чтобы дать пользователю попробовать снова.
 */
export async function abortPackageIdempotency(heldKey: string | null): Promise<void> {
  if (!heldKey) return;
  await clearBookingIdempotency(heldKey);
}
