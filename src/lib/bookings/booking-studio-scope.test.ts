import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderType } from "@prisma/client";

import { createBookingRow } from "@/lib/bookings/booking-row";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-C1 · SMOKE-01 · F1 — бронь, снятая через поверхность студии, управляется
 * этой студией.
 *
 * ## Что чинится
 *
 * Журнал и календарь студии ПОКАЗЫВАЮТ бронь по `providerId`
 * (`OR: [{ studioId }, { providerId }]`), а авторизация действия РАЗРЕШАЕТ её
 * только по `studioId` (`assertBelongsToStudio` → `where: { id, studioId }`).
 * Пока три из семи путей создания `studioId` не выставляли, эти два ответа
 * расходились: бронь видна в журнале, а «перенести» отвечает 404.
 *
 * ## Почему тест построен именно так
 *
 * 🔴 Дефект прожил ровно потому, что **фикстуры соглашались с кодом, который
 * нарушал правило**: и юнит-тесты, и showcase-сид конструировали брони с уже
 * проставленным `studioId`, а единственный путь, который его не ставил, ни
 * одной фикстурой не моделировался. Поэтому здесь бронь строится **настоящим
 * `createBooking`** — тем самым, что вызывает `POST /api/bookings`, — а не
 * хелпером и не литералом. Замоканы соседи (лимитер, резолвер контекста,
 * уведомления), но путь записи и сам writer — живые.
 *
 * Предметом проверки взято НЕ «поле заполнено», а «студия может ей управлять»:
 * запись сверяется предикатом той же формы, что и `assertBelongsToStudio`.
 * Разница существенная — поле можно заполнить чужим значением, и тест на
 * «не null» этого не заметил бы.
 *
 * @probe   что сломать: в `lib/bookings/booking-row.ts` заменить вывод на
 *          `studioId: null`.
 *          наблюдалось: «бронь, снятая через страницу студии, неуправляема из
 *          её кабинета: assertBelongsToStudio(...) → 404» — красный, плюс красный
 *          структурный тест не понадобился (дефект пойман поведением).
 *          восстановлено, `git diff` пуст, зелено.
 */

const STUDIO_PROVIDER_ID = "prov-studio-vision";
const STUDIO_ROW_ID = "studio-vision";
/** Мастер-член студии: его собственный `Provider`, у которого `Studio`-строки нет. */
const MEMBER_PERSONAL_PROVIDER_ID = "prov-master-marina";

const state = vi.hoisted(() => ({
  /** Что записал единственный writer. */
  createdData: null as Record<string, unknown> | null,
  /** Провайдер, которого вернёт замоканный `resolveBookingCore`. */
  provider: null as { id: string; type: ProviderType; studioId: string | null } | null,
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    studio: {
      // Единственная реальная зависимость writer'а: `Studio` по `providerId @unique`.
      findUnique: async ({ where }: { where: { providerId: string } }) =>
        where.providerId === STUDIO_PROVIDER_ID ? { id: STUDIO_ROW_ID } : null,
    },
    booking: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.createdData = data;
        return { id: "bk-1", ...data, service: { id: "svc-1", name: "Маникюр" } };
      },
    },
    bookingServiceItem: { create: async () => ({ id: "item-1" }) },
    mediaAsset: { update: async () => ({}) },
  };
  return {
    prisma: {
      ...tx,
      discountRule: { findUnique: async () => null },
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }));

vi.mock("@/lib/bookings/booking-core", () => ({
  ensureNoConflicts: async () => {},
  resolveBookingCore: async () => ({
    provider: {
      ...state.provider!,
      ownerUserId: "owner-1",
      timezone: "Asia/Yekaterinburg",
      autoConfirmBookings: false,
      bufferBetweenBookingsMin: 0,
    },
    service: {
      id: "svc-1",
      providerId: state.provider!.id,
      title: null,
      name: "Маникюр",
      isEnabled: true,
      isActive: true,
      durationMin: 60,
      baseDurationMin: 60,
      price: 200_000,
      basePrice: 200_000,
      effectivePrice: 200_000,
    },
    master: null,
    resolvedMasterProviderId: null,
    durationMin: 60,
    startAtUtc: new Date("2026-09-01T07:00:00.000Z"),
    endAtUtc: new Date("2026-09-01T08:00:00.000Z"),
    bufferMin: 0,
    shouldAutoConfirm: false,
  }),
}));

vi.mock("@/lib/bookings/booking-extras", () => ({
  resolveBookingExtras: async () => ({ referencePhotoAssetId: null, bookingAnswers: null }),
}));
vi.mock("@/lib/bookings/mappers", () => ({ toBookingDto: (row: unknown) => row }));
vi.mock("@/lib/bookings/reminders", () => ({ scheduleBookingRemindersSafe: async () => {} }));
vi.mock("@/lib/bookings/slot-invalidation", () => ({
  invalidateSlotsForBookingRange: async () => {},
}));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: async () => {} }));
vi.mock("@/lib/chat/system-messages", () => ({ emitBookingCreatedSystemMessage: async () => {} }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: () => {}, logError: () => {} }));

const { createBooking } = await import("@/lib/bookings/createBooking");

/**
 * Форма запроса из `assertBelongsToStudio("booking", …)`: студия действует
 * только над строкой, у которой `studioId` — её собственный.
 */
function studioCanManage(row: Record<string, unknown> | null, studioId: string): boolean {
  return Boolean(row) && row!.studioId === studioId;
}

async function bookThrough(providerId: string, providerShape: {
  type: ProviderType;
  studioId: string | null;
}): Promise<Record<string, unknown>> {
  state.createdData = null;
  state.provider = { id: providerId, ...providerShape };
  await createBooking({
    providerId,
    serviceId: "svc-1",
    masterProviderId: null,
    startAtUtc: new Date("2026-09-01T07:00:00.000Z"),
    endAtUtc: new Date("2026-09-01T08:00:00.000Z"),
    slotLabel: "01.09 10:00-11:00",
    clientName: "Смоук Екб",
    clientPhone: "+79061112233",
    comment: null,
    clientUserId: "user-guest-1",
  });
  return state.createdData!;
}

describe("FIX-C1 · воспроизведение F1 через НАСТОЯЩИЙ путь создания", () => {
  beforeEach(() => {
    state.createdData = null;
  });

  it("бронь с публичной страницы студии управляется кабинетом этой студии", async () => {
    const row = await bookThrough(STUDIO_PROVIDER_ID, {
      type: ProviderType.STUDIO,
      studioId: null,
    });

    expect(
      studioCanManage(row, STUDIO_ROW_ID),
      "бронь, снятая через страницу студии, неуправляема из её кабинета: " +
        `assertBelongsToStudio({ id, studioId: "${STUDIO_ROW_ID}" }) не найдёт строку ` +
        `со studioId=${JSON.stringify(row.studioId)} → 404 «Запись не найдена» (SMOKE-01 · F1)`,
    ).toBe(true);
  });

  it("та же бронь помечена как онлайн-запись, а не как звонок", async () => {
    // Побочная находка F1: журнал студии подписывал её «Звонок», потому что
    // молчание вызывающего означало `@default(MANUAL)`.
    const row = await bookThrough(STUDIO_PROVIDER_ID, {
      type: ProviderType.STUDIO,
      studioId: null,
    });
    expect(row.source).toBe("WEB");
  });

  it("бронь через ЛИЧНЫЙ профиль мастера студии студии НЕ принадлежит", async () => {
    // Статус-кво продукта (LOGIC-01 п.5 остался открытым, `AUDIT-CAMPAIGN-BLOCKED.md`):
    // мастер-член студии принимает записи и через свой публичный профиль. Такие
    // брони журнал студии не показывает (её скоуп — `studioId` ИЛИ
    // `providerId` СТУДИИ, а здесь providerId мастера), значит и управлять ими
    // студия не должна. Вывод из ЧЛЕНСТВА отдал бы их студии — вывод из
    // ПОВЕРХНОСТИ не отдаёт.
    const row = await bookThrough(MEMBER_PERSONAL_PROVIDER_ID, {
      type: ProviderType.MASTER,
      studioId: STUDIO_PROVIDER_ID, // мастер СОСТОИТ в студии
    });

    expect(row.studioId, "личная бронь мастера утекла в скоуп студии").toBeNull();
    expect(studioCanManage(row, STUDIO_ROW_ID)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Единственность writer'а — выводится из дерева, а не из списка имён.
 * ------------------------------------------------------------------ */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SRC = resolve(PROJECT_ROOT, "src");
const WRITER = "src/lib/bookings/booking-row.ts";

/**
 * Прямая вставка строки брони — `prisma.booking.create` / `tx.booking.create`.
 *
 * 🔴 **ДЕМОТИРОВАН FIX-C6 — читать вместе с тем, что теперь несёт тип.**
 *
 * `bookingTransaction` выдаёт `BookingTx`, у которого метода `booking.create`
 * НЕТ (`Omit`), а `createBookingRow` возвращает себе право вставки
 * единственным приведением у себя в теле. Поэтому обе формы, ради которых
 * FIX-C5 записал этого сторожа слабым, теперь не компилируются:
 *
 *   - `tx.booking.create({…})` — прямая;
 *   - `const t = tx.booking; t.create({…})` — извлечение делегата заранее,
 *     ровно тот обход, что детектор не видел.
 *
 * Проба обеих — `booking-transaction.test.ts` (`@ts-expect-error`, снятие
 * `Omit` делает директивы неиспользованными и валит `typecheck`).
 *
 * ⚠️ **Что детектор добавляет сверх типа — и почему его нельзя удалить.**
 * У ПУЛОВОГО клиента (`prisma`, `prismaDirect`) метод `booking.create`
 * остаётся: без него `booking-row.ts` не смог бы вставить строку. Значит две
 * поверхности типом не закрыты и держатся только этой проверкой:
 *
 *   1. `prisma.booking.create(…)` вообще вне транзакции;
 *   2. `tx.booking.create(…)` в транзакции, открытой сырым
 *      `prisma.$transaction` (в обход обёртки) — такой `tx` полный.
 *
 * Обе — по-прежнему форма вызова, и обе обходятся извлечением делегата в
 * переменную. Это записано, чтобы «зелено» здесь читалось как «известных форм
 * нет», а не «нарушений нет».
 */
const RAW_CREATE = /\.booking\.create\s*\(/;
/**
 * Потребитель writer'а — по ИМПОРТУ модуля, не по вызову.
 *
 * FIX-C5: было `createBookingRow\s*\(`. Набор путей здесь ВЫВОДИТСЯ, и файл,
 * выпавший из набора, перестаёт участвовать в проверке не-вакуумности, — то
 * есть алиас давал бы тихо сузившуюся семью. Вызвать, не импортировав, нельзя.
 */
const WRITER_IMPORT = /@\/lib\/bookings\/booking-row/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const rel = (file: string) => file.slice(PROJECT_ROOT.length + 1).split(sep).join("/");
// FIX-C6 (GUARD-INTEGRITY правило 6): по СЫРОМУ тексту этот детектор ложно
// краснел на прозе — `booking-transaction.ts` объясняет в шапке, какую именно
// форму `.booking.create(` он делает невыразимой, и попадал в нарушители из-за
// собственного объяснения. Разбор — общим посимвольным сканером.
const sources = walk(SRC).map((file) => ({
  rel: rel(file),
  text: stripComments(readFileSync(file, "utf8")),
}));
const createPaths = sources.filter((f) => WRITER_IMPORT.test(f.text)).map((f) => f.rel).sort();

describe("FIX-C1 · `Booking` пишет ровно один writer", () => {
  it("детектор находит семью путей создания — иначе сторож вакуумен", () => {
    // Семь путей на 2026-08-13: воронка, легаси-воронка, соло-пакет,
    // студийный пакет, кабинет студии, ручная запись соло-мастера,
    // подтверждение модель-оффера. Порог ниже фактического числа намеренно:
    // он ловит «регексп перестал находить», а не фиксирует инвентарь.
    expect(
      createPaths.length,
      "ни один файл не распознан как создающий бронь — вероятно, изменилась " +
        "форма вызова и сторож стал no-op",
    ).toBeGreaterThanOrEqual(6);
  });

  it("никто не вставляет строку брони в обход writer'а", () => {
    const offenders = sources
      .filter((f) => f.rel !== WRITER && RAW_CREATE.test(f.text))
      .map((f) => f.rel);

    expect(
      offenders,
      "путь создаёт `Booking` напрямую, минуя `createBookingRow` — значит сам " +
        "решает вопрос `studioId`/`source`, а решить его молчанием и есть дефект " +
        `F1: ${offenders.join(", ")}. ` +
        "FIX-C6: внутри `bookingTransaction` это уже не компилируется — сюда " +
        "попадает только вставка ПУЛОВЫМ клиентом либо транзакцией, открытой в " +
        "обход обёртки.",
    ).toEqual([]);
  });

  it("writer действительно выводит `studioId` из поверхности", async () => {
    // Не-вакуумность самого writer'а, в отрыве от `createBooking`: для
    // провайдера без `Studio`-строки ответ обязан быть `null`, для студийного —
    // её id. Иначе «единственный writer» мог бы быть единственным и неправым.
    const seen: Array<Record<string, unknown>> = [];
    const db = {
      studio: {
        findUnique: async ({ where }: { where: { providerId: string } }) =>
          where.providerId === STUDIO_PROVIDER_ID ? { id: STUDIO_ROW_ID } : null,
      },
      booking: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          seen.push(data);
          return { id: "x" };
        },
      },
    } as unknown as Parameters<typeof createBookingRow>[0];

    const base = {
      serviceId: "svc-1",
      slotLabel: "l",
      clientName: "c",
      clientPhone: "p",
      source: "WEB",
    } as const;

    await createBookingRow(db, { data: { ...base, providerId: STUDIO_PROVIDER_ID }, select: { id: true } });
    await createBookingRow(db, { data: { ...base, providerId: MEMBER_PERSONAL_PROVIDER_ID }, select: { id: true } });

    expect(seen.map((d) => d.studioId)).toEqual([STUDIO_ROW_ID, null]);
  });
});

/* ------------------------------------------------------------------ *
 * Тип не даёт вызывающему промолчать.
 * ------------------------------------------------------------------ */

type WriterData = Parameters<typeof createBookingRow>[1]["data"];

describe("FIX-C1 · решение нельзя ни подменить, ни обойти молчанием", () => {
  it("`studioId` вырезан из входа, `source` обязателен — оба на уровне компилятора", () => {
    const decided: WriterData = {
      providerId: "p",
      serviceId: "s",
      slotLabel: "l",
      clientName: "c",
      clientPhone: "+70000000000",
      source: "WEB",
    };

    // @ts-expect-error `studioId` решает writer: передать его нельзя, поэтому
    // нельзя и передать неверный (кросс-тенантная атрибуция невыразима).
    const overridden: WriterData = { ...decided, studioId: "studio-someone-else" };

    // @ts-expect-error молчание про `source` означало `@default(MANUAL)` —
    // онлайн-запись подписывалась «Звонок» (побочная находка F1).
    const silent: WriterData = {
      providerId: "p",
      serviceId: "s",
      slotLabel: "l",
      clientName: "c",
      clientPhone: "+70000000000",
    };

    // Предмет — сам факт того, что две строки выше не компилируются.
    expect([decided, overridden, silent]).toHaveLength(3);
  });
});
