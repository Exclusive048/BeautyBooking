import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PENDING-EXPIRY (решение владельца 2026-09-24) — неподтверждённая запись
 * отменяется через 24 ч после создания или к началу визита.
 * PENDING-EXPIRY-STARVATION (решение владельца 2026-10-30) — истекает и запрос
 * переноса на неподтверждённой записи; сосед по пакету в неявке истечению не
 * мешает; строки, которые истечь не могут, не занимают пачку.
 *
 * @probe 2026-09-24 — в `pendingExpiryWhere` убрана ветка `startAtUtc <= now`:
 * красный «срок — 24 ч после создания или начало визита». Возвращено — зелёный.
 * Пробы PENDING-EXPIRY-STARVATION (2026-10-30) — в блоке над стендом базы.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  packageFindFirst: vi.fn(),
  packageUpdate: vi.fn(),
  applyBookingTransition: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  load: vi.fn(async (id: string) => ({ id })),
  notify: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: mocks.findMany },
    bookingPackage: { findFirst: mocks.packageFindFirst },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ bookingPackage: { update: mocks.packageUpdate } }),
  },
}));
vi.mock("@/lib/bookings/transition", () => ({ applyBookingTransition: mocks.applyBookingTransition }));
vi.mock("@/lib/bookings/slot-invalidation", () => ({ invalidateSlotsForBookingRange: mocks.invalidate }));
vi.mock("@/lib/logging/logger", () => ({ logError: mocks.logError, logInfo: mocks.logInfo }));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: mocks.load,
  notifyPendingBookingExpired: mocks.notify,
}));

import { BookingPackageStatus, BookingStatus } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import {
  PENDING_EXPIRY_BATCH_SIZE,
  expirablePackageWhere,
  expirePendingBookings,
  pendingExpiryWhere,
  unconfirmedBookingWhere,
} from "@/lib/bookings/expire-pending";

const NOW = new Date("2026-09-24T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3600_000);
const statusRace = () => new AppError("Статус записи изменился.", 409, "BOOKING_STATUS_CHANGED");

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: "PENDING",
    statusBeforeChange: null,
    bookingPackageId: null,
    providerId: "p1",
    masterProviderId: "m1",
    startAtUtc: hours(5),
    endAtUtc: hours(6),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` реализации не снимает — стенд базы ниже ставит свои.
  mocks.findMany.mockReset();
  mocks.packageFindFirst.mockReset();
  mocks.packageUpdate.mockReset();
  mocks.packageUpdate.mockImplementation(async () => ({}));
  mocks.applyBookingTransition.mockReset();
  mocks.applyBookingTransition.mockImplementation(async () => ({ id: "x" }));
});

describe("pendingExpiryWhere", () => {
  it("срок — 24 ч после создания или начало визита; кандидат — неподтверждённая запись", () => {
    const where = pendingExpiryWhere(NOW);
    expect(where.AND).toContainEqual(unconfirmedBookingWhere());
    expect(where.AND).toContainEqual({
      OR: [{ createdAt: { lte: hours(-24) } }, { startAtUtc: { lte: NOW } }],
    });
  });
});

describe("expirePendingBookings", () => {
  it("отменяет системой с причиной и уведомляет, пока визит впереди", async () => {
    mocks.findMany.mockResolvedValue([row("b1")]);

    const summary = await expirePendingBookings(NOW);

    expect(summary).toEqual({ candidates: 1, expired: 1 });
    expect(mocks.applyBookingTransition).toHaveBeenCalledWith(expect.anything(), {
      id: "b1",
      expectedStatus: "PENDING",
      data: expect.objectContaining({ status: "REJECTED", cancelledBy: "SYSTEM", cancelledAtUtc: NOW }),
      select: { id: true },
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("закончившийся визит — уборка без уведомлений", async () => {
    mocks.findMany.mockResolvedValue([row("b1", { startAtUtc: hours(-30), endAtUtc: hours(-29) })]);

    await expirePendingBookings(NOW);

    expect(mocks.applyBookingTransition).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("мастер успел подтвердить — строка пропускается", async () => {
    mocks.findMany.mockResolvedValue([row("b1")]);
    mocks.applyBookingTransition.mockRejectedValueOnce(statusRace());

    const summary = await expirePendingBookings(NOW);

    expect(summary.expired).toBe(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});

/**
 * Стенд базы: `findMany` и `bookingPackage.findFirst` не возвращают
 * заготовленный ответ, а ИСПОЛНЯЮТ `where` над набором строк (`matchesWhere` —
 * подмножество семантики Prisma, которое использует модуль; незнакомый ключ —
 * исключение, а не молчаливое «да») с тем же порядком и потолком пачки. Иначе
 * тесты проверяли бы мок, а не запрос.
 *
 * Сравнения с пустым значением — по правилам SQL: `IN`/`NOT IN`/`<>` над `NULL`
 * дают «не подходит». Ровно на этом ломается запись «не неподтверждена» через
 * отрицание — стенд обязан это видеть.
 *
 * Переход статуса исполняется над строкой стенда с той же охраной, что
 * `applyBookingTransition`: наблюдённый статус и `expectAlso`.
 *
 * @probe 2026-10-30 — из `unconfirmedBookingWhere` снята ветка
 * `CHANGE_REQUESTED` + `statusBeforeChange`: красные «перенос, открытый на
 * записи NEW/PENDING, истекает», «срок — от ИСХОДНОГО времени…» и лок-степ
 * «одно правило…» на строках «CHANGE_REQUESTED, до переноса NEW/PENDING» (условие
 * пакета разошлось с правилом выборки). Из `TERMINAL_STATUSES` убран `NO_SHOW`:
 * красные «пакет с неявкой истекает целиком», «прежде застрявшие пакеты с
 * неявкой…», строка таблицы «сосед NO_SHOW» и лок-степ на всех строках NO_SHOW.
 * В `packageBlockingBookingWhere` снята ветка `statusBeforeChange: null`:
 * красные строка таблицы «сосед CHANGE_REQUESTED, до переноса —», лок-степ на
 * той же строке и «201 строка, которая истечь не может…» (пакет с переносом
 * строки до миграции стал кандидатом). В `expiryTransition` снят `expectAlso`:
 * красные «между чтением и записью перенос подтвердили…» и оба «перенос,
 * открытый на записи…». Из `pendingExpiryWhere` снято условие на пакет: красные
 * «201 строка…», «пакет с подтверждённой частью…», «отменённый пакет…» и все
 * строки таблицы с ожиданием «false». Возвращено — зелёный.
 */
type FakeBooking = {
  id: string;
  status: BookingStatus;
  statusBeforeChange: BookingStatus | null;
  bookingPackageId: string | null;
  providerId: string;
  masterProviderId: string | null;
  createdAt: Date;
  startAtUtc: Date;
  endAtUtc: Date;
  proposedStartAt: Date | null;
};
type FakePackage = { id: string; status: BookingPackageStatus; bookings: FakeBooking[] };

function matchesValue(filter: unknown, value: unknown): boolean {
  if (filter instanceof Date) return value instanceof Date && value.getTime() === filter.getTime();
  if (filter === null || typeof filter !== "object") return value === filter;
  return Object.entries(filter as Record<string, unknown>).every(([op, arg]) => {
    // SQL: любое сравнение с NULL — не «да».
    if (value === null) return false;
    switch (op) {
      case "in":
        return (arg as unknown[]).includes(value);
      case "notIn":
        return !(arg as unknown[]).includes(value);
      case "not":
        return value !== arg;
      case "lte":
        return (value as Date).getTime() <= (arg as Date).getTime();
      default:
        throw new Error(`matchesValue: оператор «${op}» не поддержан стендом`);
    }
  });
}

let fakeBookings: FakeBooking[] = [];
let fakePackages = new Map<string, FakePackage>();

function matchesPackage(where: Record<string, unknown>, pkg: FakePackage): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "id" || key === "status") return matchesValue(filter, pkg[key]);
    if (key === "bookings") {
      const { none, ...rest } = filter as { none?: Record<string, unknown> };
      if (!none || Object.keys(rest).length > 0) throw new Error("bookings: стенд понимает только none");
      return !pkg.bookings.some((booking) => matchesWhere(none, booking));
    }
    throw new Error(`matchesPackage: ключ «${key}» не поддержан стендом`);
  });
}

function matchesWhere(where: Record<string, unknown>, booking: FakeBooking): boolean {
  return Object.entries(where).every(([key, filter]) => {
    switch (key) {
      case "AND":
        return (filter as Record<string, unknown>[]).every((part) => matchesWhere(part, booking));
      case "OR":
        return (filter as Record<string, unknown>[]).some((part) => matchesWhere(part, booking));
      case "bookingPackage": {
        const { is, ...rest } = filter as { is?: Record<string, unknown> };
        if (!is || Object.keys(rest).length > 0) throw new Error("bookingPackage: стенд понимает только is");
        const pkg = booking.bookingPackageId ? fakePackages.get(booking.bookingPackageId) : undefined;
        return pkg !== undefined && matchesPackage(is, pkg);
      }
      case "status":
      case "statusBeforeChange":
      case "createdAt":
      case "startAtUtc":
      case "proposedStartAt":
      case "bookingPackageId":
        return matchesValue(filter, booking[key]);
      default:
        throw new Error(`matchesWhere: ключ «${key}» не поддержан стендом`);
    }
  });
}

type FindManyArgs = { where: Record<string, unknown>; take: number };
type FindFirstArgs = { where: Record<string, unknown> };
type TransitionArgs = {
  id: string;
  expectedStatus: BookingStatus;
  expectAlso?: { statusBeforeChange?: BookingStatus | null };
  data: { status: BookingStatus; statusBeforeChange: null; proposedStartAt: null };
};
type PackageUpdateArgs = { where: { id: string }; data: { status: BookingPackageStatus } };

function installFakeDb(bookings: FakeBooking[], packages: FakePackage[]) {
  fakeBookings = bookings;
  fakePackages = new Map(packages.map((pkg) => [pkg.id, pkg]));
  mocks.findMany.mockImplementation(async (args: FindManyArgs) =>
    fakeBookings
      .filter((booking) => matchesWhere(args.where, booking))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, args.take)
      .map((booking) => ({ ...booking })),
  );
  mocks.packageFindFirst.mockImplementation(async (args: FindFirstArgs) => {
    const pkg = [...fakePackages.values()].find((candidate) => matchesPackage(args.where, candidate));
    if (!pkg) return null;
    const sorted = [...pkg.bookings].sort((a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime());
    return { id: pkg.id, bookings: sorted.map((booking) => ({ ...booking })) };
  });
  mocks.applyBookingTransition.mockImplementation(async (_db: unknown, args: TransitionArgs) => {
    const target = fakeBookings.find((booking) => booking.id === args.id);
    const alsoMismatch =
      args.expectAlso !== undefined &&
      "statusBeforeChange" in args.expectAlso &&
      target?.statusBeforeChange !== args.expectAlso.statusBeforeChange;
    if (!target || target.status !== args.expectedStatus || alsoMismatch) throw statusRace();
    target.status = args.data.status;
    target.statusBeforeChange = args.data.statusBeforeChange;
    target.proposedStartAt = args.data.proposedStartAt;
    return { id: target.id };
  });
  mocks.packageUpdate.mockImplementation(async (args: PackageUpdateArgs) => {
    const pkg = fakePackages.get(args.where.id);
    if (pkg) pkg.status = args.data.status;
    return {};
  });
}

/** Просрочена по сроку «24 ч от создания», визит уже прошёл. */
function fakeBooking(id: string, extra: Partial<FakeBooking> = {}): FakeBooking {
  return {
    id,
    status: BookingStatus.PENDING,
    statusBeforeChange: null,
    bookingPackageId: null,
    providerId: "p1",
    masterProviderId: "m1",
    createdAt: hours(-48),
    startAtUtc: hours(-30),
    endAtUtc: hours(-29),
    proposedStartAt: null,
    ...extra,
  };
}

function fakePackage(
  id: string,
  bookings: FakeBooking[],
  status: BookingPackageStatus = BookingPackageStatus.ACTIVE,
): FakePackage {
  for (const booking of bookings) booking.bookingPackageId = id;
  return { id, status, bookings };
}

const statusOf = (id: string) => fakeBookings.find((booking) => booking.id === id)?.status;
const transitionedIds = () =>
  (mocks.applyBookingTransition.mock.calls as unknown as Array<[unknown, { id: string }]>).map(
    ([, args]) => args.id,
  );

describe("пакет — только целиком", () => {
  it("две неподтверждённые услуги — пакет отменяется целиком, одно уведомление", async () => {
    const first = fakeBooking("c1", { startAtUtc: hours(5), endAtUtc: hours(6) });
    const second = fakeBooking("c2", { startAtUtc: hours(7), endAtUtc: hours(8) });
    installFakeDb([first, second], [fakePackage("pkg", [first, second])]);

    const summary = await expirePendingBookings(NOW);

    expect(summary).toEqual({ candidates: 2, expired: 2 });
    expect(mocks.packageUpdate).toHaveBeenCalledWith({ where: { id: "pkg" }, data: { status: "CANCELLED" } });
    expect(mocks.packageFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("пакет с подтверждённой частью не трогается и в выборку не попадает", async () => {
    const pending = fakeBooking("c1");
    const confirmed = fakeBooking("c2", {
      status: BookingStatus.CONFIRMED,
      startAtUtc: hours(5),
      endAtUtc: hours(6),
    });
    installFakeDb([pending, confirmed], [fakePackage("pkg", [pending, confirmed])]);

    expect(await expirePendingBookings(NOW)).toEqual({ candidates: 0, expired: 0 });
    expect(mocks.applyBookingTransition).not.toHaveBeenCalled();
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });

  it("пакет с неявкой истекает целиком: живые услуги — разом, неявка не трогается", async () => {
    const noShow = fakeBooking("c1", { status: BookingStatus.NO_SHOW });
    const pending = fakeBooking("c2", { startAtUtc: hours(5), endAtUtc: hours(6) });
    installFakeDb([noShow, pending], [fakePackage("pkg", [noShow, pending])]);

    const summary = await expirePendingBookings(NOW);

    expect(summary.expired).toBe(1);
    expect(transitionedIds()).toEqual(["c2"]);
    expect(statusOf("c1")).toBe(BookingStatus.NO_SHOW);
    expect(statusOf("c2")).toBe(BookingStatus.REJECTED);
    expect(fakePackages.get("pkg")?.status).toBe(BookingPackageStatus.CANCELLED);
  });

  it("пакет с переносом неподтверждённой услуги истекает целиком, вместе с ним", async () => {
    const pending = fakeBooking("c1");
    const rescheduled = fakeBooking("c2", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: BookingStatus.PENDING,
      proposedStartAt: hours(30),
    });
    installFakeDb([pending, rescheduled], [fakePackage("pkg", [pending, rescheduled])]);

    expect((await expirePendingBookings(NOW)).expired).toBe(2);
    expect(statusOf("c1")).toBe(BookingStatus.REJECTED);
    expect(statusOf("c2")).toBe(BookingStatus.REJECTED);
  });

  it("отменённый пакет с неподтверждённой услугой — не кандидат", async () => {
    const pending = fakeBooking("pend");
    installFakeDb([pending], [fakePackage("pkg-x", [pending], BookingPackageStatus.CANCELLED)]);

    expect(await expirePendingBookings(NOW)).toEqual({ candidates: 0, expired: 0 });
  });

  /**
   * Таблица правила: неподтверждённая услуга + сосед в каждом статусе (и с
   * каждым «статусом до переноса») + пакет в каждом статусе. Ожидание выписано
   * НЕЗАВИСИМО от модуля — прямо из решения владельца — и сверяется с ОБЕИМИ
   * точками: условием выборки и полным проходом (`expirePackage` перечитывает
   * пакет тем же условием).
   */
  const UNCONFIRMED = new Set<BookingStatus>([BookingStatus.NEW, BookingStatus.PENDING]);
  const TERMINAL = new Set<BookingStatus>([
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
    BookingStatus.FINISHED,
  ]);
  const siblingAllowsExpiry = (status: BookingStatus, before: BookingStatus | null) =>
    TERMINAL.has(status) ||
    UNCONFIRMED.has(status) ||
    (status === BookingStatus.CHANGE_REQUESTED && before !== null && UNCONFIRMED.has(before));

  const BEFORE_VALUES: Array<BookingStatus | null> = [
    null,
    BookingStatus.NEW,
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
  ];
  const cases = Object.values(BookingPackageStatus).flatMap((packageStatus) =>
    Object.values(BookingStatus).flatMap((siblingStatus) =>
      (siblingStatus === BookingStatus.CHANGE_REQUESTED ? BEFORE_VALUES : [null]).map((before) => ({
        packageStatus,
        siblingStatus,
        before,
        beforeLabel: before ?? "—",
        expected:
          packageStatus !== BookingPackageStatus.CANCELLED && siblingAllowsExpiry(siblingStatus, before),
      })),
    ),
  );
  it.each(cases)(
    "пакет $packageStatus, сосед $siblingStatus, до переноса $beforeLabel → истекает: $expected",
    async ({ packageStatus, siblingStatus, before, expected }) => {
      const pending = fakeBooking("pend");
      const sibling = fakeBooking("sib", {
        status: siblingStatus,
        statusBeforeChange: before,
        // Сосед свежий и впереди: сам по себе он кандидатом не бывает.
        createdAt: hours(-1),
        startAtUtc: hours(10),
        endAtUtc: hours(11),
      });
      installFakeDb([pending, sibling], [fakePackage("pkg", [pending, sibling], packageStatus)]);

      expect(matchesWhere(pendingExpiryWhere(NOW) as Record<string, unknown>, pending)).toBe(expected);
      const summary = await expirePendingBookings(NOW);
      expect(statusOf("pend") === BookingStatus.REJECTED).toBe(expected);
      expect(summary.expired > 0).toBe(expected);
    },
  );
});

describe("одно правило «неподтверждена» — для выборки и для пакета", () => {
  /**
   * Пакет пускает услугу ровно тогда, когда она терминальна ИЛИ подходит под
   * `unconfirmedBookingWhere` — то есть условие пакета обязано быть точным
   * дополнением того же правила, а не своей версией «неподтверждённости».
   * Перебор — все статусы × все «статусы до переноса», включая пустой.
   */
  const TERMINAL = new Set<BookingStatus>([
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
    BookingStatus.FINISHED,
  ]);
  const cases = Object.values(BookingStatus).flatMap((status) =>
    [null, ...Object.values(BookingStatus)].map((before) => ({ status, before, beforeLabel: before ?? "—" })),
  );
  it.each(cases)("услуга $status, до переноса $beforeLabel", ({ status, before }) => {
    const booking = fakeBooking("x", { status, statusBeforeChange: before });
    const pkg = fakePackage("pkg", [booking]);
    fakePackages = new Map([[pkg.id, pkg]]);

    const unconfirmed = matchesWhere(unconfirmedBookingWhere() as Record<string, unknown>, booking);
    const packageAllows = matchesPackage(expirablePackageWhere() as Record<string, unknown>, pkg);
    expect(packageAllows).toBe(TERMINAL.has(status) || unconfirmed);
  });
});

describe("запрос переноса на неподтверждённой записи (решение владельца 2026-10-30)", () => {
  it.each([BookingStatus.NEW, BookingStatus.PENDING])(
    "перенос, открытый на записи %s, истекает: REJECTED системой, предложение сброшено",
    async (before) => {
      const booking = fakeBooking("cr", {
        status: BookingStatus.CHANGE_REQUESTED,
        statusBeforeChange: before,
        startAtUtc: hours(5),
        endAtUtc: hours(6),
        proposedStartAt: hours(29),
      });
      installFakeDb([booking], []);

      expect(await expirePendingBookings(NOW)).toEqual({ candidates: 1, expired: 1 });
      expect(mocks.applyBookingTransition).toHaveBeenCalledWith(expect.anything(), {
        id: "cr",
        expectedStatus: BookingStatus.CHANGE_REQUESTED,
        expectAlso: { statusBeforeChange: before },
        data: expect.objectContaining({
          status: BookingStatus.REJECTED,
          cancelledBy: "SYSTEM",
          proposedStartAt: null,
          proposedEndAt: null,
          actionRequiredBy: null,
          statusBeforeChange: null,
        }),
        select: { id: true },
      });
      // Визит впереди — клиент и сторона провайдера узнают.
      expect(mocks.notify).toHaveBeenCalledTimes(1);
    },
  );

  it("перенос подтверждённой записи (и строки до миграции) не истекает — визит в силе", async () => {
    const confirmed = fakeBooking("cr-confirmed", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: BookingStatus.CONFIRMED,
    });
    const legacy = fakeBooking("cr-legacy", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: null,
    });
    installFakeDb([confirmed, legacy], []);

    expect(await expirePendingBookings(NOW)).toEqual({ candidates: 0, expired: 0 });
  });

  it("срок — от ИСХОДНОГО времени визита, а не от предложенного", async () => {
    // Создана 2 ч назад; исходный визит через 5 ч; предложенное время уже прошло.
    const notYet = fakeBooking("cr", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: BookingStatus.PENDING,
      createdAt: hours(-2),
      startAtUtc: hours(5),
      endAtUtc: hours(6),
      proposedStartAt: hours(-1),
    });
    // То же, но исходный визит уже начался — истекает.
    const started = fakeBooking("cr-started", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: BookingStatus.PENDING,
      createdAt: hours(-2),
      startAtUtc: hours(-1),
      endAtUtc: hours(1),
      proposedStartAt: hours(20),
    });
    installFakeDb([notYet, started], []);

    await expirePendingBookings(NOW);

    expect(transitionedIds()).toEqual(["cr-started"]);
    expect(statusOf("cr")).toBe(BookingStatus.CHANGE_REQUESTED);
  });

  it("между чтением и записью перенос подтвердили и попросили новый — запись не истекает", async () => {
    const booking = fakeBooking("cr", {
      status: BookingStatus.CHANGE_REQUESTED,
      statusBeforeChange: BookingStatus.PENDING,
    });
    installFakeDb([booking], []);
    const read = mocks.findMany.getMockImplementation()!;
    // Круг CHANGE_REQUESTED → CONFIRMED → CHANGE_REQUESTED: статус тот же, запись уже подтверждена.
    mocks.findMany.mockImplementation(async (args: FindManyArgs) => {
      const result = await read(args);
      booking.statusBeforeChange = BookingStatus.CONFIRMED;
      return result;
    });

    expect((await expirePendingBookings(NOW)).expired).toBe(0);
    expect(statusOf("cr")).toBe(BookingStatus.CHANGE_REQUESTED);
  });
});

describe("PENDING-EXPIRY-STARVATION — строки, которые истечь не могут, не занимают пачку", () => {
  /** Неподтверждённая услуга, чей сосед по пакету ждёт решения мастера. */
  function blockedPackage(index: number) {
    const createdAt = new Date(hours(-200).getTime() + index * 1000);
    const pending = fakeBooking(`pend-${index}`, { createdAt });
    const ahead = { createdAt, startAtUtc: hours(10), endAtUtc: hours(11) };
    // Три формы «пакет ждёт мастера»: подтверждена, перенос подтверждённой, перенос строки до миграции.
    const sibling =
      index % 3 === 0
        ? fakeBooking(`sib-${index}`, { ...ahead, status: BookingStatus.CONFIRMED })
        : fakeBooking(`sib-${index}`, {
            ...ahead,
            status: BookingStatus.CHANGE_REQUESTED,
            statusBeforeChange: index % 3 === 1 ? BookingStatus.CONFIRMED : null,
          });
    return { pkg: fakePackage(`pkg-${index}`, [pending, sibling]), rows: [pending, sibling] };
  }

  it("201 строка, которая истечь не может, + одна обычная просроченная → обычная истекает", async () => {
    // Старше обычной записи — то есть в голове выборки по `createdAt asc`.
    const blocked = Array.from({ length: PENDING_EXPIRY_BATCH_SIZE + 1 }, (_, index) =>
      blockedPackage(index),
    );
    const ordinary = fakeBooking("ordinary", { createdAt: hours(-30) });
    installFakeDb(
      [...blocked.flatMap((entry) => entry.rows), ordinary],
      blocked.map((entry) => entry.pkg),
    );

    const summary = await expirePendingBookings(NOW);

    expect(summary).toEqual({ candidates: 1, expired: 1 });
    expect(transitionedIds()).toEqual(["ordinary"]);
    expect(mocks.packageFindFirst).not.toHaveBeenCalled();
  });

  it("прежде застрявшие пакеты с неявкой истекают — 201 пакет и обычная запись за два прохода", async () => {
    const packages = Array.from({ length: PENDING_EXPIRY_BATCH_SIZE + 1 }, (_, index) => {
      const createdAt = new Date(hours(-200).getTime() + index * 1000);
      const pending = fakeBooking(`pend-${index}`, { createdAt });
      const noShow = fakeBooking(`sib-${index}`, { createdAt, status: BookingStatus.NO_SHOW });
      return { pkg: fakePackage(`pkg-${index}`, [pending, noShow]), rows: [pending, noShow] };
    });
    const ordinary = fakeBooking("ordinary", { createdAt: hours(-30) });
    installFakeDb(
      [...packages.flatMap((entry) => entry.rows), ordinary],
      packages.map((entry) => entry.pkg),
    );

    expect(await expirePendingBookings(NOW)).toEqual({
      candidates: PENDING_EXPIRY_BATCH_SIZE,
      expired: PENDING_EXPIRY_BATCH_SIZE,
    });
    expect(await expirePendingBookings(NOW)).toEqual({ candidates: 2, expired: 2 });
    expect(statusOf("ordinary")).toBe(BookingStatus.REJECTED);
    expect(await expirePendingBookings(NOW)).toEqual({ candidates: 0, expired: 0 });
  });
});

describe("PENDING-EXPIRY-STARVATION — полная пачка без движения видна в логе", () => {
  const fullBatch = () => Array.from({ length: PENDING_EXPIRY_BATCH_SIZE }, (_, index) => row(`b${index}`));

  it("вся пачка не сдвинулась — ошибка batchStalled", async () => {
    mocks.findMany.mockResolvedValue(fullBatch());
    mocks.applyBookingTransition.mockImplementation(async () => {
      throw statusRace();
    });

    await expirePendingBookings(NOW);

    expect(mocks.logError).toHaveBeenCalledWith("bookings.pendingExpiry.batchStalled", {
      candidates: PENDING_EXPIRY_BATCH_SIZE,
      expired: 0,
      stuck: PENDING_EXPIRY_BATCH_SIZE,
    });
  });

  it("часть полной пачки не сдвинулась — строка в лог; неполная пачка — тишина", async () => {
    mocks.findMany.mockResolvedValue(fullBatch());
    mocks.applyBookingTransition.mockRejectedValueOnce(statusRace());

    await expirePendingBookings(NOW);

    expect(mocks.logInfo).toHaveBeenCalledWith("bookings.pendingExpiry.batchShort", {
      candidates: PENDING_EXPIRY_BATCH_SIZE,
      expired: PENDING_EXPIRY_BATCH_SIZE - 1,
      stuck: 1,
    });
    expect(mocks.logError).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([row("b1")]);
    mocks.applyBookingTransition.mockRejectedValueOnce(statusRace());
    await expirePendingBookings(NOW);
    expect(mocks.logInfo).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});
