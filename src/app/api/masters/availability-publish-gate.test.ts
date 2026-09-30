import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * SEC-05 — `GET /api/masters/[id]/availability` не отдаёт расписание
 * неопубликованного кабинета анониму.
 *
 * Роут ходил в `provider.findUnique` без фильтра `isPublished`, тогда как оба
 * соседних публичных эндпоинта (`/slots`, `/booking-days`) передают
 * `requirePublished: true`. Любой, кто знает CUID провайдера, читал живое
 * расписание чернового или приостановленного кабинета: рабочие часы, занятые
 * интервалы, паузы.
 *
 * Гейт нельзя ставить «в лоб»: у роута ДВЕ аудитории — анонимный виджет записи
 * в студию и кабинетное окно переноса брони (`reschedule-modal.tsx`). Мастер,
 * снявший профиль с публикации, обязан продолжать переносить существующие
 * брони, поэтому своя сторона (владелец кабинета и админ студии) проходит по
 * `requireProviderOwner`. Тест держит обе половины: закрытие для чужих И
 * сохранение доступа для своих.
 */

const state = vi.hoisted(() => ({
  published: false,
  sessionOk: false,
  ownerOk: false,
}));

const spies = vi.hoisted(() => ({
  resolveProvider: vi.fn(),
  getSessionUser: vi.fn(),
  requireProviderOwner: vi.fn(),
  listBookableSlots: vi.fn(),
}));

vi.mock("@/lib/providers/resolve-provider", () => ({
  resolveProviderBySlugOrId: (args: { requirePublished?: boolean }) => {
    spies.resolveProvider(args);
    // Публичный резолв отдаёт строку только для опубликованного кабинета.
    if (args.requirePublished && !state.published) return Promise.resolve(null);
    return Promise.resolve({
      id: "prov1",
      timezone: "Europe/Moscow",
      minBookingHoursAhead: 2,
      maxBookingDaysAhead: 60,
      visibleSlotDays: 30,
    });
  },
}));

// BOOKING-WINDOW-SPLIT: роут читает окно записи владельца услуги напрямую из
// Prisma. CI гоняет тесты без БД (`DATABASE_URL: ""`), поэтому без мока этот
// запрос бросал бы и давал 500 — локально его маскировала живая dev-БД.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: {
      findUnique: vi.fn(async () => ({
        provider: { minBookingHoursAhead: 2, maxBookingDaysAhead: 60 },
      })),
    },
    // STUDIO-MASTER-PROFILES: правило «активный мастер опубликованной студии»
    // (`studio/active-studio-master.ts`) спрашивает `provider.count`; кабинет
    // этого теста мастером студии не является.
    provider: { findUnique: vi.fn(async () => null), count: vi.fn(async () => 0) },
  },
}));

vi.mock("@/lib/auth/access", () => ({
  getSessionUser: () => {
    spies.getSessionUser();
    if (!state.sessionOk) throw new Error("UNAUTHORIZED");
    return Promise.resolve({ userId: "u1", role: "MASTER", roles: ["MASTER"] });
  },
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProviderOwner: () => {
    spies.requireProviderOwner();
    if (!state.ownerOk) throw new Error("FORBIDDEN");
    return Promise.resolve();
  },
}));

vi.mock("@/lib/schedule/resolveDuration", () => ({
  resolveServiceDuration: vi.fn(async () => ({ ok: true as const, data: 60 })),
}));

vi.mock("@/lib/schedule/bookable-window", () => ({
  listBookableSlots: (...args: unknown[]) => {
    spies.listBookableSlots(...args);
    return Promise.resolve({ ok: true as const, slots: [{ startAtUtc: "x" }], meta: {} });
  },
}));

vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { GET } from "@/app/api/masters/[id]/availability/route";

const URL_OK = "http://localhost/api/masters/prov1/availability?serviceId=svc1&from=2026-08-10";

function call() {
  return GET(new Request(URL_OK), { params: Promise.resolve({ id: "prov1" }) });
}

beforeEach(() => {
  state.published = false;
  state.sessionOk = false;
  state.ownerOk = false;
  spies.resolveProvider.mockClear();
  spies.getSessionUser.mockClear();
  spies.requireProviderOwner.mockClear();
  spies.listBookableSlots.mockClear();
});

describe("SEC-05 · публикация обязательна для чужих", () => {
  it("аноним + неопубликованный кабинет → 404, расписание НЕ считается", async () => {
    const res = await call();
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).toContain("MASTER_NOT_FOUND");
    expect(spies.listBookableSlots).not.toHaveBeenCalled();
  });

  it("публичный резолв запрашивается именно с requirePublished", async () => {
    state.published = true;
    await call();
    expect(spies.resolveProvider).toHaveBeenCalledWith(
      expect.objectContaining({ requirePublished: true }),
    );
  });

  it("аутентифицированный, но ЧУЖОЙ пользователь + неопубликованный → 404", async () => {
    state.sessionOk = true;
    state.ownerOk = false;
    const res = await call();
    expect(res.status).toBe(404);
    expect(spies.listBookableSlots).not.toHaveBeenCalled();
  });
});

describe("SEC-05 · своя сторона и публичный кабинет не задеты", () => {
  it("аноним + опубликованный кабинет → 200 (виджет записи работает)", async () => {
    state.published = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(spies.listBookableSlots).toHaveBeenCalledTimes(1);
    // Своя сторона не проверялась — публичного резолва хватило.
    expect(spies.getSessionUser).not.toHaveBeenCalled();
  });

  it("владелец кабинета + НЕопубликованный → 200 (перенос брони не ломается)", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(spies.listBookableSlots).toHaveBeenCalledTimes(1);
    expect(spies.requireProviderOwner).toHaveBeenCalledTimes(1);
  });
});
