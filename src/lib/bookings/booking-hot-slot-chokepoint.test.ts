import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import { ProviderType } from "@prisma/client";

import { resolveBookingServicePrice } from "@/lib/bookings/hot-slot-pricing";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";

/**
 * FIX-C1 (фаза 3) · FIX-B18 — анти-фрод горячих слотов enforce'ится в
 * чокпойнте, а не в двух вызывающих.
 *
 * ## Что было
 *
 * `isHotSlotRebookBlocked` звался из `createBooking.ts` и `createClientBooking.ts`,
 * и **полнота этой пары не проверялась ничем**: FIX-B18 записал прямым текстом,
 * что третий путь создания брони унаследует горячие слоты без анти-фрода молча.
 * Существующий `hot-slots/anti-fraud.test.ts` проверяет предикат, а не его
 * вызывающих, — по построению этого не увидел бы.
 *
 * ## Почему НЕ сторож со списком путей
 *
 * Список — это инвентарь, а инвентари в этом проекте протухали четырежды
 * (#35, #38, «пятая копия» LOGIC-01, область сканирования #25). Здесь доступна
 * форма сильнее: правило стоит там, где выдаётся **выгода**. Скидочную цену
 * возвращает ровно та функция, которая проверяет анти-фрод, — получить одно без
 * другого невозможно, потому что это один вызов.
 *
 * Отсюда и предмет структурной половины: примитив `resolveDynamicHotSlotPricing`
 * (он и считает скидку) вне модуля-обёртки разрешён только ЧИТАЮЩИМ
 * поверхностям, где брони не создаются. Новый путь создания, не зовущий
 * обёртку, скидки не даст вовсе — мошенничать будет нечем; путь, который скидку
 * даёт, пройдёт проверку по построению.
 *
 * @probe   (1) в `hot-slot-pricing.ts` обезврежен блок
 *          `if (recentCancel && isHotSlotRebookBlocked(…)) throw` →
 *          «promise resolved "140000" instead of rejecting» — красный.
 *          (2) в `createBooking.ts` добавлен доступ к примитиву цены →
 *          «файл получил доступ к расчёту скидки в обход чокпойнта:
 *          src/lib/bookings/createBooking.ts» — красный.
 *          (3) в `createBooking.ts` добавлен импорт предиката анти-фрода →
 *          «предикат импортируется вне чокпойнта» — красный.
 *          Всё восстановлено, `diff` с бэкапом пуст, зелено.
 *
 * 🔴 **Проба (2) исправила сам сторож, а не только подтвердила его.** Первая
 * версия детектора искала ВЫЗОВ (`resolveDynamicHotSlotPricing\(`) и на пробе
 * осталась ЗЕЛЁНОЙ: `const f = resolveDynamicHotSlotPricing; f({…})` — вызов
 * есть, формы нет. То есть сторож проверял написание, а не доступ, — ровно тот
 * дефект, против которого заведён инв. #43, и увидеть его можно было только
 * пробой. Детектор переведён на импорт: вызвать, не импортировав, нельзя.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SRC = resolve(PROJECT_ROOT, "src");
const CHOKEPOINT = "src/lib/bookings/hot-slot-pricing.ts";

/**
 * Кому МОЖНО считать скидку мимо чокпойнта — перечень с причиной, а не перечень
 * проверяемых (тот же приём, что `MASTER_CRM_READERS` в инв. #25). Новый файл
 * валит тест просто потому, что его здесь нет.
 */
const PRICING_READERS: Record<string, string> = {
  "src/app/api/hot-slots/route.ts": "лента горячих слотов — только чтение, брони не создаёт",
  "src/app/api/public/providers/[providerId]/slots/route.ts":
    "витрина слотов — только чтение, брони не создаёт",
};

/**
 * Детектируется **импорт**, а не вызов, и это не педантизм: первая версия
 * сторожа искала `resolveDynamicHotSlotPricing(` и была проверена пробой —
 * реэкспорт/алиас (`const f = resolveDynamicHotSlotPricing; f({…})`) её обходил,
 * оставаясь зелёным. Импорт — это акт, которым доступ ВЫДАЁТСЯ; вызвать, не
 * импортировав, нельзя, поэтому обойти нечем.
 */
const IMPORTS_PRICING = /from\s+["']@\/lib\/hot-slots\/runtime["']/;
const IMPORTS_ANTI_FRAUD = /from\s+["']@\/lib\/hot-slots\/anti-fraud["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.slice(PROJECT_ROOT.length + 1).split(sep).join("/");
const sources = walk(SRC).map((file) => ({ rel: rel(file), text: readFileSync(file, "utf8") }));

describe("FIX-C1 · скидка и анти-фрод неразделимы", () => {
  it("детектор находит потребителей примитива — иначе сторож вакуумен", () => {
    const users = sources.filter((f) => IMPORTS_PRICING.test(f.text)).map((f) => f.rel);
    expect(
      users.length,
      "ни один файл не распознан как импортирующий примитив цены — вероятно, " +
        "переехал модуль и сторож стал no-op",
    ).toBeGreaterThanOrEqual(3);
  });

  it("доступ к расчёту скидки есть только у чокпойнта и читающих поверхностей", () => {
    const offenders = sources
      .filter((f) => f.rel !== CHOKEPOINT && IMPORTS_PRICING.test(f.text))
      .filter((f) => !(f.rel in PRICING_READERS))
      .map((f) => f.rel);

    expect(
      offenders,
      "файл получил доступ к расчёту скидки в обход чокпойнта — значит анти-фрод " +
        "на этом пути надо вспомнить руками, а именно это и был дефект FIX-B18. " +
        "Создаёте бронь — зовите `resolveBookingServicePrice`; только читаете — " +
        `внесите файл в PRICING_READERS с причиной: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("доступ к предикату анти-фрода есть только у чокпойнта", () => {
    const importers = sources
      .filter((f) => IMPORTS_ANTI_FRAUD.test(f.text))
      .map((f) => f.rel);

    expect(
      importers,
      "предикат импортируется вне чокпойнта — вторая копия правила: " + importers.join(", "),
    ).toEqual([CHOKEPOINT]);
  });
});

/* ------------------------------------------------------------------ *
 * Поведение самого чокпойнта.
 * ------------------------------------------------------------------ */

const START = new Date("2026-09-01T12:00:00.000Z");
const HOT_RULE = {
  isEnabled: true,
  triggerHours: 48,
  discountType: "PERCENT" as const,
  discountValue: 30,
  applyMode: "ALL_SERVICES" as const,
  minPriceFrom: null,
  serviceIds: [] as string[],
};

function dbWith(recentCancel: { id: string; cancelledAtUtc: Date } | null) {
  return {
    discountRule: { findUnique: async () => HOT_RULE },
    booking: { findFirst: async () => recentCancel },
  } as unknown as Parameters<typeof resolveBookingServicePrice>[0]["db"];
}

const baseInput = {
  providerId: "prov-master",
  providerType: ProviderType.MASTER,
  resolvedMasterProviderId: "prov-master",
  clientUserId: "user-1",
  serviceId: "svc-1",
  basePrice: 200_000,
  startAtUtc: START,
  providerTimeZone: "Europe/Moscow",
  hotSlotRequested: false,
  // Слот в горячем окне (48 ч): «сейчас» за сутки до начала.
  now: new Date(START.getTime() - 24 * 60 * 60 * 1000),
};

describe("FIX-C1 · чокпойнт даёт скидку только вместе с проверкой", () => {
  it("горячий слот без недавней отмены — скидка выдаётся", async () => {
    const price = await resolveBookingServicePrice({ ...baseInput, db: dbWith(null) });
    expect(price).toBe(140_000);
  });

  it("тот же слот, отменённый самим клиентом менее суток назад — отказ", async () => {
    const cancelledAt = new Date(
      START.getTime() - (HOT_SLOT_REBOOK_BLOCK_HOURS - 1) * 60 * 60 * 1000,
    );
    await expect(
      resolveBookingServicePrice({
        ...baseInput,
        db: dbWith({ id: "bk-cancelled", cancelledAtUtc: cancelledAt }),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("отмена старше окна блокировки скидку не отнимает", async () => {
    const cancelledAt = new Date(
      START.getTime() - (HOT_SLOT_REBOOK_BLOCK_HOURS + 1) * 60 * 60 * 1000,
    );
    const price = await resolveBookingServicePrice({
      ...baseInput,
      db: dbWith({ id: "bk-old", cancelledAtUtc: cancelledAt }),
    });
    expect(price).toBe(140_000);
  });

  it("клиент прислал hotSlotId, а слот уже не горячий — отказ", async () => {
    await expect(
      resolveBookingServicePrice({
        ...baseInput,
        db: dbWith(null),
        hotSlotRequested: true,
        // «Сейчас» задолго до начала — окно 48 ч ещё не открылось.
        now: new Date(START.getTime() - 10 * 24 * 60 * 60 * 1000),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
