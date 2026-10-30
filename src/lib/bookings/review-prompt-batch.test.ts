import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Проход cron'а «Оставьте отзыв» (`runBookingReviewPromptJob`).
 *
 * Стенд — не заготовленные ответы, а таблица броней, над которой ИСПОЛНЯЕТСЯ
 * `where` запроса (статус, окно, отзыв, уже отправленное приглашение, ключ
 * страницы, порядок, `take`). Незнакомый ключ условия бросает — новая форма
 * выборки не пройдёт мимо стенда молча. Рассылка помечает бронь приглашённой,
 * как это делает настоящая запись уведомления.
 *
 * @probe 2026-10-30 (REVIEW-PROMPT-SELECTION) — каждая правка ниже возвращалась
 * после наблюдения:
 *   - убрано `notifications: { none: … }` из `reviewPromptWhere` → красные
 *     «250 приглашённых…» (приглашённые получают запрос повторно), «уже
 *     приглашённые не попадают…» и «потолок страниц…» (второй тик повторяет);
 *   - снят цикл страниц (одна страница за тик) → красные «250 непоследних
 *     услуг пакетов…», «равный конец визита…» и «потолок страниц…»;
 *   - убран `orderBy` → красный «250 непоследних услуг пакетов…» (ключ
 *     страницы над неупорядоченной выдачей перескакивает новую бронь);
 *   - ключ страницы `endAtUtc: { gt }` без второй ветки (`id` при равном
 *     конце) → красный «равный конец визита…»;
 *   - потолок не пишет `logInfo` → красный «потолок страниц…».
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const bookingFindUnique = vi.hoisted(() => vi.fn());
const loadBookingsWithRelations = vi.hoisted(() => vi.fn());
const notifyBookingCompletedReview = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: bookingFindMany, findUnique: bookingFindUnique },
  },
}));

vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingsWithRelations,
  notifyBookingCompletedReview,
}));

vi.mock("@/lib/logging/logger", () => ({ logError, logInfo }));

import {
  REVIEW_PROMPT_MAX_PAGES,
  REVIEW_PROMPT_PAGE_SIZE,
  runBookingReviewPromptJob,
} from "@/lib/bookings/review-prompts";

const REVIEW_TYPE = "BOOKING_COMPLETED_REVIEW";
const NOW = new Date("2026-08-06T10:00:00Z");

type Row = {
  id: string;
  status: string;
  endAtUtc: Date | null;
  clientUserId: string | null;
  hasReview: boolean;
  notified: string[];
  bookingPackageId: string | null;
};

let db: Row[] = [];

function row(id: string, patch: Partial<Row> = {}): Row {
  return {
    id,
    status: "FINISHED",
    endAtUtc: new Date("2026-08-06T08:00:00Z"),
    clientUserId: "client",
    hasReview: false,
    notified: [],
    bookingPackageId: null,
    ...patch,
  };
}

// ── Исполнитель условий ─────────────────────────────────────────────────────

type Cond = Record<string, unknown>;

function matchesValue(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === "string") return value === cond;
  if (typeof cond !== "object") throw new Error(`стенд: незнакомое условие ${String(cond)}`);
  return Object.entries(cond as Cond).every(([op, arg]) => {
    if (op === "not" && arg === null) return value !== null;
    // SQL: сравнение с NULL — не истина ни в одну сторону.
    if (value === null) return false;
    const cmp = (a: unknown, b: unknown) =>
      a instanceof Date && b instanceof Date
        ? a.getTime() - b.getTime()
        : String(a).localeCompare(String(b));
    switch (op) {
      case "in":
        return (arg as unknown[]).includes(value);
      case "notIn":
        return !(arg as unknown[]).includes(value);
      case "gt":
        return cmp(value, arg) > 0;
      case "gte":
        return cmp(value, arg) >= 0;
      case "lt":
        return cmp(value, arg) < 0;
      case "lte":
        return cmp(value, arg) <= 0;
      default:
        throw new Error(`стенд: незнакомый оператор ${op}`);
    }
  });
}

function matchesWhere(r: Row, where: Cond): boolean {
  return Object.entries(where).every(([key, cond]) => {
    switch (key) {
      case "AND":
        return (cond as Cond[]).every((w) => matchesWhere(r, w));
      case "OR":
        return (cond as Cond[]).some((w) => matchesWhere(r, w));
      case "review": {
        const c = cond as Cond;
        if (!("is" in c) || c.is !== null) throw new Error("стенд: review — только { is: null }");
        return !r.hasReview;
      }
      case "notifications": {
        const none = (cond as { none?: { type?: string } }).none;
        if (!none?.type || Object.keys(cond as Cond).length !== 1) {
          throw new Error("стенд: notifications — только { none: { type } }");
        }
        return !r.notified.includes(none.type);
      }
      case "status":
      case "endAtUtc":
      case "clientUserId":
      case "id":
      case "bookingPackageId":
        return matchesValue(r[key], cond);
      default:
        throw new Error(`стенд: незнакомый ключ условия ${key}`);
    }
  });
}

function compareBy(orderBy: Array<Record<string, "asc" | "desc">>) {
  return (a: Row, b: Row) => {
    for (const clause of orderBy) {
      const [field, dir] = Object.entries(clause)[0]!;
      const av = a[field as keyof Row];
      const bv = b[field as keyof Row];
      const diff =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : String(av).localeCompare(String(bv));
      if (diff !== 0) return dir === "asc" ? diff : -diff;
    }
    return 0;
  };
}

type FindManyArgs = {
  where: Cond;
  select: Record<string, true>;
  orderBy?: Array<Record<string, "asc" | "desc">>;
  take?: number;
};

function fakeFindMany(args: FindManyArgs) {
  let found = db.filter((r) => matchesWhere(r, args.where));
  if (args.orderBy) found = [...found].sort(compareBy(args.orderBy));
  if (args.take !== undefined) found = found.slice(0, args.take);
  return found.map((r) =>
    Object.fromEntries(Object.keys(args.select).map((k) => [k, r[k as keyof Row]])),
  );
}

function promptedIds(): string[] {
  return notifyBookingCompletedReview.mock.calls.map((call) => (call[0] as { id: string }).id);
}

beforeEach(() => {
  db = [];
  bookingFindMany.mockReset();
  bookingFindUnique.mockReset();
  loadBookingsWithRelations.mockReset();
  notifyBookingCompletedReview.mockReset();
  logError.mockReset();
  logInfo.mockReset();

  bookingFindMany.mockImplementation(async (args: FindManyArgs) => fakeFindMany(args));
  loadBookingsWithRelations.mockImplementation(async (wanted: string[]) =>
    new Map(db.filter((r) => wanted.includes(r.id)).map((r) => [r.id, { id: r.id }])),
  );
  // Рассылка пишет уведомление — бронь становится приглашённой.
  notifyBookingCompletedReview.mockImplementation(async (booking: { id: string }) => {
    db.find((r) => r.id === booking.id)?.notified.push(REVIEW_TYPE);
  });
});

/**
 * PERF-26 — проход читал снапшот брони ВНУТРИ цикла: `findUnique` + рассылка на
 * каждого кандидата, до 400 последовательных round-trip'ов на 200 строк.
 * Сторожится и стоимость чтения, и изоляция рассылки по элементу: батчинг
 * чтения соблазняет «упростить» цикл до `Promise.all`, а это и потеря изоляции,
 * и параллельная нагрузка на push-канал.
 */
describe("PERF-26 · проход не читает снапшоты поштучно", () => {
  it("двести кандидатов — одно чтение снапшотов, а не двести", async () => {
    db = Array.from({ length: REVIEW_PROMPT_PAGE_SIZE }, (_, i) =>
      row(`bk_${String(i).padStart(3, "0")}`),
    );

    await runBookingReviewPromptJob(NOW);

    expect(loadBookingsWithRelations).toHaveBeenCalledTimes(1);
    expect(loadBookingsWithRelations.mock.calls[0][0]).toHaveLength(REVIEW_PROMPT_PAGE_SIZE);
    // Поштучная читалка на этом пути не должна вызываться вовсе.
    expect(bookingFindUnique).not.toHaveBeenCalled();
    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(REVIEW_PROMPT_PAGE_SIZE);
  });

  it("уже приглашённые не попадают ни в чтение, ни в рассылку", async () => {
    db = ["bk_0", "bk_1", "bk_2", "bk_3", "bk_4"].map((id) =>
      row(id, { notified: id === "bk_1" || id === "bk_3" ? [REVIEW_TYPE] : [] }),
    );

    await runBookingReviewPromptJob(NOW);

    expect(loadBookingsWithRelations.mock.calls[0][0]).toEqual(["bk_0", "bk_2", "bk_4"]);
    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(3);
  });

  it("падение одного получателя не срывает проход", async () => {
    db = ["bk_0", "bk_1", "bk_2"].map((id) => row(id));
    notifyBookingCompletedReview.mockImplementation(async (booking: { id: string }) => {
      if (booking.id === "bk_1") throw new Error("push недоступен");
    });

    await runBookingReviewPromptJob(NOW);

    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][1]).toMatchObject({ bookingId: "bk_1" });
  });

  it("исчезнувшая между запросами бронь просто пропускается", async () => {
    db = ["bk_0", "bk_1", "bk_2"].map((id) => row(id));
    loadBookingsWithRelations.mockResolvedValue(new Map([["bk_0", { id: "bk_0" }]]));

    await runBookingReviewPromptJob(NOW);

    expect(notifyBookingCompletedReview).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("пустой набор кандидатов не идёт ни за снапшотами, ни за уведомлениями", async () => {
    await runBookingReviewPromptJob(NOW);

    expect(bookingFindMany).toHaveBeenCalledTimes(1);
    expect(loadBookingsWithRelations).not.toHaveBeenCalled();
    expect(notifyBookingCompletedReview).not.toHaveBeenCalled();
  });
});

/**
 * REVIEW-PROMPT-01 — запрос отзыва уходит тогда, когда отзыв уже можно оставить,
 * по всем незакрытым статусам и один раз на пакет.
 *
 * @probe 2026-09-22 — `readyBefore` заменён на `now` (прежняя форма): красным
 * стал «не раньше открытия окна отзыва» (`lte` = 10:00 вместо 09:00). Фильтр
 * статуса, возвращённый к `status: "CONFIRMED"`, красит кейс статусов; отбор
 * пакета без `dropNonFinalPackageComponents` красит кейс пакета.
 */
describe("REVIEW-PROMPT-01 · когда и кому уходит запрос отзыва", () => {
  it("не раньше открытия окна отзыва (конец визита + 60 минут)", async () => {
    await runBookingReviewPromptJob(NOW);

    const where = bookingFindMany.mock.calls[0][0].where;
    expect(where.endAtUtc.lte).toEqual(new Date("2026-08-06T09:00:00Z"));
  });

  it("закончившийся меньше часа назад визит ещё не приглашается", async () => {
    db = [
      row("early", { endAtUtc: new Date("2026-08-06T09:30:00Z") }),
      row("ready", { endAtUtc: new Date("2026-08-06T08:59:00Z") }),
    ];

    await runBookingReviewPromptJob(NOW);

    expect(promptedIds()).toEqual(["ready"]);
  });

  it("берёт любой незакрытый статус, а не только CONFIRMED", async () => {
    await runBookingReviewPromptJob(NOW);

    const where = bookingFindMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] });
  });

  it("пакет получает один запрос — по последней услуге", async () => {
    db = [
      row("p1", { bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T07:00:00Z") }),
      row("p2", { bookingPackageId: "pkg", endAtUtc: new Date("2026-08-06T08:00:00Z") }),
      row("solo", { endAtUtc: new Date("2026-08-06T08:00:00Z") }),
    ];

    await runBookingReviewPromptJob(NOW);

    expect(promptedIds().sort()).toEqual(["p2", "solo"]);
  });
});

/**
 * REVIEW-PROMPT-SELECTION (B-03, 2026-10-30) — выборка «первые 200 из окна» была
 * без порядка и без исключения уже приглашённых, поэтому при объёме больше
 * пачки новый визит в неё не попадал: места занимали приглашённые и
 * непоследние услуги пакетов, а после выхода из окна (24 ч) запрос терялся.
 */
describe("REVIEW-PROMPT-SELECTION · новый визит не вытесняется", () => {
  it("250 приглашённых и одна новая бронь — новая получает запрос, приглашённые нет", async () => {
    db = Array.from({ length: 250 }, (_, i) =>
      row(`old_${String(i).padStart(3, "0")}`, {
        endAtUtc: new Date(Date.UTC(2026, 7, 5, 12, 0) + i * 60_000),
        notified: [REVIEW_TYPE],
      }),
    );
    db.push(row("new", { endAtUtc: new Date("2026-08-06T08:30:00Z") }));

    await runBookingReviewPromptJob(NOW);

    expect(promptedIds()).toEqual(["new"]);
    const where = bookingFindMany.mock.calls[0][0].where;
    expect(where.notifications).toEqual({ none: { type: REVIEW_TYPE } });
  });

  it("250 непоследних услуг пакетов и новая бронь — новая получает запрос за тот же тик", async () => {
    // Пакет i: услуга «a» кончилась в 04:00 + i минут (в окне), последняя
    // услуга «b» ещё впереди — запрос пакету пока рано, но «a» занимает место
    // в выборке. Новая бронь (08:05) — 246-я по концу визита, то есть на
    // второй странице.
    const packageRows = (i: number): Row[] => {
      const pkg = `pkg_${String(i).padStart(3, "0")}`;
      return [
        row(`${pkg}_a`, {
          bookingPackageId: pkg,
          endAtUtc: new Date(Date.UTC(2026, 7, 6, 4, 0) + i * 60_000),
        }),
        row(`${pkg}_b`, {
          bookingPackageId: pkg,
          status: "CONFIRMED",
          endAtUtc: new Date("2026-08-06T15:00:00Z"),
        }),
      ];
    };
    // Строки лежат в базе не в порядке конца визита: самый поздний пакет (249,
    // 08:09) записан двухсотым. Без `orderBy` он становится ключом страницы, и
    // вторая страница («после 08:09») перескакивает новую бронь.
    const insertion = [
      ...Array.from({ length: 199 }, (_, i) => i),
      249,
      ...Array.from({ length: 50 }, (_, i) => 199 + i),
    ];
    db = insertion.flatMap(packageRows);
    db.push(row("new", { endAtUtc: new Date("2026-08-06T08:05:00Z") }));

    await runBookingReviewPromptJob(NOW);

    expect(promptedIds()).toEqual(["new"]);
    expect(bookingFindMany.mock.calls[0][0].orderBy).toEqual([{ endAtUtc: "asc" }, { id: "asc" }]);
  });

  it("равный конец визита на границе страницы — следующая страница продолжает по id", async () => {
    const sameEnd = new Date("2026-08-06T08:00:00Z");
    db = Array.from({ length: REVIEW_PROMPT_PAGE_SIZE + 1 }, (_, i) =>
      row(`same_${String(i).padStart(3, "0")}`, {
        endAtUtc: sameEnd,
        // Рассылка падает — строка остаётся неприглашённой, и следующую
        // страницу держит только ключ (`endAtUtc`, `id`), а не исключение.
      }),
    );
    notifyBookingCompletedReview.mockImplementation(async () => {
      throw new Error("push недоступен");
    });

    await runBookingReviewPromptJob(NOW);

    expect(new Set(promptedIds()).size).toBe(REVIEW_PROMPT_PAGE_SIZE + 1);
    expect(promptedIds()).toHaveLength(REVIEW_PROMPT_PAGE_SIZE + 1);
  });

  it("потолок страниц за тик — остаток берёт следующий тик, в лог строка", async () => {
    const total = REVIEW_PROMPT_PAGE_SIZE * REVIEW_PROMPT_MAX_PAGES + 1;
    db = Array.from({ length: total }, (_, i) =>
      row(`bk_${String(i).padStart(5, "0")}`, {
        endAtUtc: new Date(Date.UTC(2026, 7, 5, 12, 0) + i * 1_000),
      }),
    );

    await runBookingReviewPromptJob(NOW);

    expect(promptedIds()).toHaveLength(total - 1);
    expect(bookingFindMany).toHaveBeenCalledTimes(REVIEW_PROMPT_MAX_PAGES);
    expect(logInfo).toHaveBeenCalledWith("bookings.reviewPrompts.pageCeiling", {
      pages: REVIEW_PROMPT_MAX_PAGES,
      scanned: total - 1,
    });

    notifyBookingCompletedReview.mockClear();
    await runBookingReviewPromptJob(NOW);
    expect(promptedIds()).toEqual([`bk_${String(total - 1).padStart(5, "0")}`]);
  });
});
