import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 03 — публичные окошки `/api/masters/{id}/availability`
 * (виджет записи в студию) не дальше «Сколько окошек вперёд» мастера; перенос
 * существующей записи эта настройка не ограничивает.
 *
 * @probe 2026-09-29 — обрезка убрана (`toKeyExclusive` всегда из запроса):
 * покраснел «публичный запрос — не дальше 7 дней». Обрезка всегда (без
 * `isPublicListing`): покраснел «перенос своей записи — не обрезается».
 * Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({ sessionOk: false, ownerOk: false }));
const listBookableSlots = vi.hoisted(() => vi.fn());
const bookingFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", () => ({
  resolveProviderBySlugOrId: () =>
    Promise.resolve({
      id: "prov1",
      timezone: "Asia/Yekaterinburg",
      minBookingHoursAhead: 0,
      maxBookingDaysAhead: 30,
      visibleSlotDays: 7,
    }),
}));
vi.mock("@/lib/auth/access", () => ({
  getSessionUser: () => {
    if (!state.sessionOk) throw new Error("UNAUTHORIZED");
    return Promise.resolve({ userId: "u-client", id: "u-client", role: "CLIENT", roles: ["CLIENT"] });
  },
}));
vi.mock("@/lib/auth/ownership", () => ({
  requireProviderOwner: () => {
    if (!state.ownerOk) throw new Error("FORBIDDEN");
    return Promise.resolve();
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: (...args: unknown[]) => bookingFindUnique(...args) },
    service: { findUnique: vi.fn(async () => ({ provider: { minBookingHoursAhead: 0, maxBookingDaysAhead: 30 } })) },
    studio: { findUnique: vi.fn(async () => null) },
    provider: { findUnique: vi.fn(async () => ({ studioId: null })) },
    masterService: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/schedule/resolveDuration", () => ({
  resolveServiceDuration: vi.fn(async () => ({ ok: true as const, data: 60 })),
}));
vi.mock("@/lib/schedule/bookable-window", () => ({
  listBookableSlots: (...args: unknown[]) => {
    listBookableSlots(...args);
    return Promise.resolve({ ok: true as const, slots: [], meta: {} });
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

// 2026-09-29T20:30Z — уже 30 сентября в Екатеринбурге (01:30).
const NOW = new Date("2026-09-29T20:30:00Z");
const BASE = "http://localhost/api/masters/prov1/availability?serviceId=svc1&from=2026-09-30";

async function call(query: string) {
  const res = await GET(new Request(`${BASE}${query}`), { params: Promise.resolve({ id: "prov1" }) });
  expect(res.status).toBe(200);
  return listBookableSlots.mock.calls.at(-1)?.[0] as { toKeyExclusive?: string; excludeBookingId?: string };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.sessionOk = false;
  state.ownerOk = false;
  listBookableSlots.mockClear();
  bookingFindUnique.mockReset();
  bookingFindUnique.mockResolvedValue({
    id: "bk1",
    clientUserId: "u-client",
    providerId: "prov1",
    masterProviderId: "prov1",
    studioId: null,
    serviceItems: [{ durationSnapshotMin: 60 }],
    startAtUtc: new Date("2026-10-01T09:00:00Z"),
    endAtUtc: new Date("2026-10-01T10:00:00Z"),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/availability — «Сколько окошек вперёд» мастера", () => {
  it("публичный запрос — не дальше 7 дней по салону", async () => {
    // 30.09 — первый день, седьмой — 06.10, исключающая граница — 07.10.
    expect((await call("")).toKeyExclusive).toBe("2026-10-07");
  });

  it("запрошенный конец раньше горизонта — остаётся", async () => {
    expect((await call("&to=2026-10-02")).toKeyExclusive).toBe("2026-10-03");
  });

  it("перенос своей записи — не обрезается", async () => {
    state.sessionOk = true;
    const input = await call("&excludeBookingId=bk1&to=2026-10-20");
    expect(input.excludeBookingId).toBe("bk1");
    expect(input.toKeyExclusive).toBe("2026-10-21");
  });
});
