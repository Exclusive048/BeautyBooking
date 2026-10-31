import { beforeEach, describe, expect, it, vi } from "vitest";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * ADMIN-EVENTS-02 — «История событий»: курсор «Показать ещё» и сборка строки.
 *
 * Prisma заменена хранилищем в памяти, которое честно исполняет то
 * подмножество `where` / `orderBy` / `take`, что строит сервис: поля времени,
 * `id`, `AND` / `OR`, `lt` / `lte` / `gte` / `not: null`. Прочие фильтры
 * (`isDeleted`, тариф, профиль кабинета) тест не моделирует — строки, которым
 * они нужны, в наборе отсутствуют.
 *
 * @probe 2026-10-27: курсор «только время» (как прежний `before`) — в
 * `keysetWhere` все три ветки заменены на `field < at`. Тест «каждое событие
 * ровно один раз» покраснел: «expected [ 'booking:b3', 'booking:b2', …(2) ] to
 * deeply equal [ 'booking:b3', 'booking:b2', …(5) ]» — `booking:b1`,
 * `admin_action:a2`, `admin_action:a1` из той же миллисекунды за границей
 * первой страницы пропали. Остальные шесть тестов при этом зелёные.
 *
 * @probe 2026-11-01 (ADMIN-EVENTS-CONTACTS): ветка гостевого профиля в
 * `bookingContactLines` заменена на `if (false)` — покраснел ровно тест
 * «гостевая запись: какой телефон получил мастер и что аккаунта нет»
 * (гость читался «клиентом с аккаунтом»), остальные зелёные.
 */

type Row = Record<string, unknown>;

const store: Record<string, Row[]> = {};

function compare(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : (a as string | number);
  const right = b instanceof Date ? b.getTime() : (b as string | number);
  return left < right ? -1 : left > right ? 1 : 0;
}

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [key, cond] of Object.entries(where as Row)) {
    if (key === "AND") {
      if (!(cond as unknown[]).every((part) => matches(row, part))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(cond as unknown[]).some((part) => matches(row, part))) return false;
      continue;
    }
    if (!(key in row)) continue;
    const value = row[key];
    if (cond instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
      continue;
    }
    if (cond && typeof cond === "object") {
      const c = cond as Row;
      if ("not" in c && c.not === null && value == null) return false;
      if (value == null && ("lt" in c || "lte" in c || "gte" in c)) return false;
      if ("lt" in c && !(compare(value, c.lt) < 0)) return false;
      if ("lte" in c && !(compare(value, c.lte) <= 0)) return false;
      if ("gte" in c && !(compare(value, c.gte) >= 0)) return false;
      if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function delegate(table: string) {
  return {
    findMany: vi.fn(async (args: { where?: unknown; orderBy?: Array<Record<string, "desc">>; take?: number }) => {
      let rows = (store[table] ?? []).filter((row) => matches(row, args.where));
      if (args.orderBy) {
        const order = args.orderBy.map((entry) => Object.keys(entry)[0]!);
        rows = [...rows].sort((a, b) => {
          for (const field of order) {
            const diff = compare(b[field], a[field]);
            if (diff !== 0) return diff;
          }
          return 0;
        });
      }
      return args.take ? rows.slice(0, args.take) : rows;
    }),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: delegate("booking"),
    userProfile: delegate("userProfile"),
    provider: delegate("provider"),
    userSubscription: delegate("userSubscription"),
    billingPayment: delegate("billingPayment"),
    review: delegate("review"),
    contentReport: delegate("contentReport"),
    adminAuditLog: delegate("adminAuditLog"),
    city: delegate("city"),
    globalCategory: delegate("globalCategory"),
    billingPlan: delegate("billingPlan"),
  },
}));

const recordPdAccess = vi.fn(async () => {});
vi.mock("@/lib/audit/pd-access", () => ({
  recordPdAccess: (...args: unknown[]) => recordPdAccess(...(args as [])),
  buildFilterFingerprint: () => "fp",
}));

const { getAdminEvents, decodeAdminEventsCursor, encodeAdminEventsCursor } = await import("./events.service");

const T = UI_TEXT.adminPanel.dashboard.feed;

const T0 = new Date("2026-10-20T10:00:00.000Z");
const T1 = new Date("2026-10-20T09:00:00.000Z");

/** Клиент с аккаунтом: входил (есть сессия), номер подтверждён. */
const client = {
  id: "u-client",
  displayName: null,
  firstName: "Елена",
  lastName: "Петрова",
  phone: "+79995000000",
  email: null,
  phoneVerifiedAt: new Date("2026-09-01T00:00:00.000Z"),
  roles: ["CLIENT"],
  emailVerifiedAt: null,
  telegramId: null,
  vkLink: null,
  yandexLink: null,
  _count: { refreshSessions: 2 },
};
/** Пассивный профиль гостевой записи: ни одного входа, ни одной связи. */
const guest = {
  ...client,
  id: "u-guest",
  firstName: null,
  lastName: null,
  phone: "+79991234567",
  phoneVerifiedAt: null,
  _count: { refreshSessions: 0 },
};
const admin = { id: "u-admin", displayName: "Артём", firstName: null, lastName: null, phone: null, email: null };
const master = { id: "p-master", name: "Анна Соколова", type: "MASTER", ownerUserId: "u-master", timezone: "Europe/Moscow" };

function booking(id: string, createdAt: Date, extra: Row = {}): Row {
  return {
    id,
    createdAt,
    cancelledAtUtc: null,
    cancelledBy: null,
    cancelReason: null,
    startAtUtc: new Date("2026-10-25T09:00:00.000Z"),
    status: "CONFIRMED",
    source: "WEB",
    clientNameSnapshot: null,
    clientName: null,
    clientPhone: "+79995000000",
    clientPhoneSnapshot: null,
    clientUser: client,
    provider: master,
    masterProvider: null,
    service: { name: "Маникюр", price: 250_000 },
    serviceItems: [],
    ...extra,
  };
}

function auditLog(id: string, createdAt: Date): Row {
  return {
    id,
    createdAt,
    action: "CITY_CREATED",
    targetType: "city",
    targetId: "city-1",
    details: null,
    reason: null,
    admin,
  };
}

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  recordPdAccess.mockClear();
  // Пять событий в одну миллисекунду из двух источников и два раньше.
  store.booking = [booking("b1", T0), booking("b2", T0), booking("b3", T0), booking("b4", T1)];
  store.adminAuditLog = [auditLog("a1", T0), auditLog("a2", T0), auditLog("a3", T1)];
  store.city = [{ id: "city-1", name: "Екатеринбург" }];
});

describe("getAdminEvents — курсор «Показать ещё»", () => {
  it("каждое событие ровно один раз и в полном порядке ленты", async () => {
    const seen: string[] = [];
    let after = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await getAdminEvents({ limit: 2, after });
      seen.push(...page.items.map((item) => item.id));
      if (!page.nextCursor) break;
      after = decodeAdminEventsCursor(page.nextCursor);
      expect(after).not.toBeNull();
    }
    // Время ↓, источник по ADMIN_EVENT_TYPES (запись раньше действия админа), id ↓.
    expect(seen).toEqual([
      "booking:b3",
      "booking:b2",
      "booking:b1",
      "admin_action:a2",
      "admin_action:a1",
      "booking:b4",
      "admin_action:a3",
    ]);
  });

  it("раздел ограничивает источники", async () => {
    const page = await getAdminEvents({ limit: 50, category: "admin" });
    expect(page.items.map((item) => item.type)).toEqual(["admin_action", "admin_action", "admin_action"]);
    expect(page.nextCursor).toBeNull();
  });

  it("испорченный курсор не разбирается", () => {
    expect(decodeAdminEventsCursor("мусор")).toBeNull();
    expect(decodeAdminEventsCursor(encodeAdminEventsCursor({ ms: 1, rank: 99, id: "x" }))).toBeNull();
    const cursor = { ms: T0.getTime(), rank: 9, id: "a1" };
    expect(decodeAdminEventsCursor(encodeAdminEventsCursor(cursor))).toEqual(cursor);
  });
});

describe("getAdminEvents — что видно в строке", () => {
  it("запись: клиент → мастер, услуга, визит в поясе салона, сумма", async () => {
    store.booking = [booking("b1", T0, { clientNameSnapshot: "Елена П." })];
    store.adminAuditLog = [];
    const { items } = await getAdminEvents({ limit: 5 });
    const event = items[0]!;
    expect(event.action).toBe(T.actions.booking);
    expect(event.actor).toEqual({ name: "Елена П.", role: T.roles.client, href: "/admin/users?q=u-client" });
    expect(event.subject).toEqual({ name: "Анна Соколова", role: T.roles.master, href: "/admin/users?q=u-master" });
    expect(event.details[0]).toBe(T.details.service("Маникюр"));
    expect(event.details[1]).toContain("12:00");
    expect(event.amountText).toContain("2");
  });

  it("ручная запись: кто — мастер, кого касается — клиент", async () => {
    store.booking = [booking("b1", T0, { source: "MANUAL" })];
    store.adminAuditLog = [];
    const { items } = await getAdminEvents({ limit: 5 });
    expect(items[0]!.action).toBe(T.actions.bookingManual);
    expect(items[0]!.actor?.name).toBe("Анна Соколова");
    expect(items[0]!.subject?.name).toBe("Елена Петрова");
  });

  it("гостевая запись: какой телефон получил мастер и что аккаунта нет", async () => {
    store.booking = [booking("b1", T0, { clientUser: guest, clientPhone: "8 999 123-45-67" })];
    store.adminAuditLog = [];
    const { items } = await getAdminEvents({ limit: 5 });
    expect(items[0]!.details).toContain(T.details.contactPhone("+7 (999) 123-45-67"));
    expect(items[0]!.details).toContain(T.details.clientKind.guest);
  });

  it("клиент с аккаунтом: номер подтверждён, только если мастеру ушёл именно он", async () => {
    store.booking = [
      booking("b1", T0),
      booking("b2", T1, { clientPhoneSnapshot: "+79990001122" }),
    ];
    store.adminAuditLog = [];
    const { items } = await getAdminEvents({ limit: 5 });
    const [same, other] = items;
    expect(same!.details).toContain(T.details.contactPhone("+7 (999) 500-00-00"));
    expect(same!.details).toContain(T.details.clientKind.accountVerified);
    // Снимок записи главнее телефона строки — его и видит мастер.
    expect(other!.details).toContain(T.details.contactPhone("+7 (999) 000-11-22"));
    expect(other!.details).toContain(T.details.clientKind.account);
  });

  it("ручная запись без клиента и без номера говорит об этом прямо", async () => {
    store.booking = [booking("b1", T0, { source: "MANUAL", clientUser: null, clientPhone: "", clientName: "Ольга" })];
    store.adminAuditLog = [];
    const { items } = await getAdminEvents({ limit: 5 });
    expect(items[0]!.details).toContain(T.details.contactNoPhone);
    expect(items[0]!.details).toContain(T.details.clientKind.none);
  });

  it("действие админа называет админа и город", async () => {
    store.booking = [];
    const { items } = await getAdminEvents({ limit: 1 });
    expect(items[0]!.action).toBe(T.actions.admin.CITY_CREATED);
    expect(items[0]!.actor).toEqual({ name: "Артём", role: T.roles.admin, href: "/admin/users?q=u-admin" });
    expect(items[0]!.details).toEqual([T.details.city("Екатеринбург")]);
  });
});

describe("getAdminEvents — след чтения ПДн (RKN-FIX-10)", () => {
  it("страница истории пишет след, опрос новых — нет", async () => {
    await getAdminEvents({ limit: 5, actor: { userId: "u-admin", ip: "10.0.0.1" } });
    expect(recordPdAccess).toHaveBeenCalledTimes(1);
    expect(recordPdAccess.mock.calls[0]).toEqual([
      expect.objectContaining({ surface: "admin.events.list", actorUserId: "u-admin", rowCount: 5 }),
    ]);

    recordPdAccess.mockClear();
    await getAdminEvents({ limit: 5, sinceMs: T1.getTime(), actor: { userId: "u-admin", ip: "10.0.0.1" } });
    expect(recordPdAccess).not.toHaveBeenCalled();
  });
});
