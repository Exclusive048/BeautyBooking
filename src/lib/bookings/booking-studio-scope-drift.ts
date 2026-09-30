import type { PrismaClient } from "@prisma/client";

/**
 * 29.09 доработки · 08 — сторож ДАННЫХ скоупа студии (инв. #45).
 *
 * Списки студии и право на действие читают одно поле — `Booking.studioId`
 * (`lib/studio/booking-scope.ts`). Код сторожить больше нечего: обе прежние
 * ветки `OR` отдают одинаковые строки, пока колонка совпадает с поверхностью.
 * Риск — дрейф самой колонки мимо writer'а `createBookingRow` (пост-деплойный
 * `updateMany` в `studios/master-profile-split.ts`, ручная правка БД): такая
 * запись молча пропадает из журнала своей студии. Поэтому детектор смотрит в
 * данные, а не в исходники, и идёт в `deploy:post` на каждом деплое.
 *
 * Классы — по сравнению `studioId` с тем, что вывел бы writer
 * (`Studio.providerId = Booking.providerId`):
 *   (а) поверхность студии, `studioId` пуст — из журнала студии пропала;
 *   (б) поверхность студии, `studioId` чужой студии — видна не той студии;
 *   (в) поверхность мастера, `studioId` задан — личная запись в журнале студии.
 * (а) и (б) чинит миграция `20260929130000_booking_studio_id_backfill`;
 * (в) — решение владельца по списку (DEPLOY-BACKLOG).
 *
 * Ядро без `server-only`: его зовёт `scripts/post-deploy.ts` (tsx, вне Next).
 *
 * @probe 2026-09-29 — живая dev-БД до миграции бэкфилла: `{ studioNull: 5,
 * otherStudio: 0, personalWithStudio: 0 }` (сидовые `seed-bk:*` пяти студий
 * до FIX-C1); после применения миграции — все нули.
 */

/** Стабильное имя сигнала — не переименовывать без правки правил алертов. */
export const BOOKING_STUDIO_SCOPE_DRIFT_FINGERPRINT = "integrity.booking-studio-scope-drift";

export type BookingStudioScopeDrift = {
  studioNull: number;
  otherStudio: number;
  personalWithStudio: number;
  /** id записей для разбора (не ПДн); не больше `sampleLimit`. */
  sampleIds: string[];
};

type DriftDb = Pick<PrismaClient, "$queryRaw">;

type CountRow = { studio_null: bigint; other_studio: bigint; personal_with_studio: bigint };

export async function findBookingStudioScopeDrift(
  db: DriftDb,
  sampleLimit = 20,
): Promise<BookingStudioScopeDrift> {
  const [counts] = await db.$queryRaw<CountRow[]>`
    SELECT
      count(*) FILTER (WHERE s.id IS NOT NULL AND b."studioId" IS NULL) AS studio_null,
      count(*) FILTER (WHERE s.id IS NOT NULL AND b."studioId" <> s.id) AS other_studio,
      count(*) FILTER (WHERE s.id IS NULL AND b."studioId" IS NOT NULL) AS personal_with_studio
    FROM "Booking" b
    LEFT JOIN "Studio" s ON s."providerId" = b."providerId"`;
  const drift = {
    studioNull: Number(counts?.studio_null ?? 0),
    otherStudio: Number(counts?.other_studio ?? 0),
    personalWithStudio: Number(counts?.personal_with_studio ?? 0),
  };
  if (drift.studioNull + drift.otherStudio + drift.personalWithStudio === 0) {
    return { ...drift, sampleIds: [] };
  }
  const samples = await db.$queryRaw<{ id: string }[]>`
    SELECT b.id
    FROM "Booking" b
    LEFT JOIN "Studio" s ON s."providerId" = b."providerId"
    WHERE b."studioId" IS DISTINCT FROM s.id
    ORDER BY b."createdAt"
    LIMIT ${sampleLimit}`;
  return { ...drift, sampleIds: samples.map((row) => row.id) };
}

export function bookingStudioScopeDriftTotal(drift: BookingStudioScopeDrift): number {
  return drift.studioNull + drift.otherStudio + drift.personalWithStudio;
}

/**
 * Шаг `deploy:post`: дрейф — строка ошибки в формате `logError` (JSON,
 * `level: "error"`) со стабильным `fingerprint`; деплой не останавливается —
 * новая версия с дрейфом работает так же, как прежняя, а чинит его разбор.
 */
export async function reportBookingStudioScopeDrift(
  db: DriftDb,
  write: (line: string) => void = (line) => console.error(line),
): Promise<BookingStudioScopeDrift> {
  const drift = await findBookingStudioScopeDrift(db);
  if (bookingStudioScopeDriftTotal(drift) > 0) {
    write(
      JSON.stringify({
        level: "error",
        message: "Booking.studioId расходится с поверхностью записи",
        fingerprint: BOOKING_STUDIO_SCOPE_DRIFT_FINGERPRINT,
        studioNull: drift.studioNull,
        otherStudio: drift.otherStudio,
        personalWithStudio: drift.personalWithStudio,
        sampleIds: drift.sampleIds,
        timestamp: new Date().toISOString(),
      }),
    );
  }
  return drift;
}
