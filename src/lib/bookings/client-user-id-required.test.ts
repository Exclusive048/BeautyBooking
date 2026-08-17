import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { stripComments } from "@/lib/testing/source-scan";

import { beginPackageIdempotency } from "@/lib/bookings/package-idempotency";
import { resolveBookingIdempotency } from "@/lib/bookings/idempotency";
import { createBooking } from "@/lib/bookings/createBooking";

/**
 * FIX-B15 · инв. #28 — неймспейс идемпотентности брони выводится ТОЛЬКО из
 * `clientUserId`, и гостевая ветка `guest:${clientPhone}` невозможна ПО ТИПУ.
 *
 * ## Почему тип, а не удаление ветки и не рантайм-guard
 *
 * До RKN-FIX-02 гость создавал бронь с `clientUserId: null`, и ключи разносились
 * телефоном. После — все четыре гостевых пути резолвят пассивный профиль ДО
 * создания брони (доказательству согласия по 152-ФЗ нужен субъект), поэтому
 * `null` не приходит. Но держалось это на **соглашении**: параметры оставались
 * `string | null`, а `/api/bookings` вообще передавал переменную, объявленную
 * как `string | null`.
 *
 * Просто удалить `?? guest:` при таком типе значило бы превратить мёртвую ветку
 * в будущий креш. Рантайм-guard был бы не лучше: при `string | null` он
 * достижим, но его срабатывание — 500 на уже валидном запросе; при `string` он
 * недостижим и становится тем самым «never-branch, которого никто не заметит».
 *
 * Поэтому выбрана третья форма: **сузить тип**. Тогда ветка не нужна, `null`
 * не компилируется, а «вернуть как было» нельзя молча — вернуть придётся
 * вместе с этим файлом.
 *
 * ## Что именно проверяется
 *
 * `@ts-expect-error` — утверждение УРОВНЯ КОМПИЛЯТОРА: строка обязана быть
 * ошибочной. Если тип когда-нибудь снова расширят до `string | null`, ошибка
 * исчезнет, и `@ts-expect-error` сам станет ошибкой «unused» → красный
 * `npm run typecheck`. То есть пин срабатывает на РАСШИРЕНИИ типа, а не на
 * рантайме, где эту регрессию наблюдать уже поздно.
 *
 * @probe   что сломать: вернуть `clientUserId: string | null` в
 *          `lib/bookings/package-idempotency.ts`.
 *          наблюдалось: `npm run typecheck` → «client-user-id-required.test.ts(NN,7):
 *          error TS2578: Unused '@ts-expect-error' directive.» — то есть красное
 *          именно расширение типа, а не какой-то побочный симптом.
 */

/**
 * Проверяется ТИП ПОЛЯ, а не конструирование объекта целиком. Первая попытка
 * была написана как вызов с `{ clientUserId: null } as never` — и `typecheck`
 * тут же указал на `TS2578: Unused '@ts-expect-error'`: приведение к `never`
 * делает объект присваиваемым, ошибки нет, и «пин» проверял бы пустоту. Форма
 * ниже такого обхода не допускает: ошибочно ровно присваивание `null`.
 */
type CreateBookingInput = Parameters<typeof createBooking>[0];
type PackageIdempotencyInput = Parameters<typeof beginPackageIdempotency>[0];
type BookingIdempotencyInput = Parameters<typeof resolveBookingIdempotency>[0];

describe("FIX-B15 · clientUserId не nullable на границах идемпотентности", () => {
  it("null отвергается компилятором на всех трёх границах", () => {
    // @ts-expect-error createBooking: гостевого неймспейса больше нет
    const a: CreateBookingInput["clientUserId"] = null;
    // @ts-expect-error beginPackageIdempotency: пакет создаётся только для профиля
    const b: PackageIdempotencyInput["clientUserId"] = null;
    // @ts-expect-error resolveBookingIdempotency: ветки `clientUserId: null` нет
    const c: BookingIdempotencyInput["userId"] = null;

    // Значения не используются по существу — предметом является сам факт того,
    // что три строки выше не компилируются.
    expect([a, b, c]).toHaveLength(3);
  });
});

/**
 * Вторая половина — исходники. Тип запрещает `null` на границе, но не запрещает
 * заново собрать неймспейс из телефона ВНУТРИ (`?? \`guest:...\``). Это ровно
 * та форма, которая жила здесь четыре месяца, поэтому она пиннится отдельно.
 */
const SRC = join(process.cwd(), "src");
const NAMESPACE_SITES = [
  "lib/bookings/createBooking.ts",
  "lib/bookings/package-idempotency.ts",
  "lib/bookings/idempotency.ts",
];

describe("FIX-B15 · гостевой неймспейс не восстановлен внутри", () => {
  it("ни один сайт не собирает ключ из телефона", () => {
    const offenders: string[] = [];
    for (const rel of NAMESPACE_SITES) {
      // FIX-C5: общий разборщик. Прежняя форма сносила строку целиком при
      // хвостовом комментарии — то есть восстановленный гостевой неймспейс с
      // пояснением рядом стал бы для сторожа невидимым (инв. #28).
      const source = stripComments(readFileSync(join(SRC, rel), "utf8"));
      source.split("\n").forEach((line, index) => {
        if (/guest:\$\{|guest:" \+|`guest:/.test(line)) {
          offenders.push(`${rel}:${index + 1} → ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `неймспейс идемпотентности снова собирается из телефона:\n${offenders.join("\n")}\n\n` +
        "После RKN-FIX-02 гость — это резолвнутый пассивный профиль, а не отсутствие профиля.",
    ).toEqual([]);
  });

  it("файлы прочитаны (иначе проверка выше вакуумна)", () => {
    for (const rel of NAMESPACE_SITES) {
      expect(readFileSync(join(SRC, rel), "utf8").length, rel).toBeGreaterThan(500);
    }
  });
});
