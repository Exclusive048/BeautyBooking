import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-5 — след массового чтения ПДн (`PdAccessLog`,
 * RKN-FIX-10) пишут настоящие страницы «Клиенты», а не только API-роуты, которые
 * интерфейс не вызывает. Здесь — мастер (`getMasterClientsView`), студия —
 * `studio-cabinet/clients/server/clients-data-pd-access.test.ts`.
 *
 * @probe 2026-09-29 — вызов `recordPdAccess` удалён из `getMasterClientsView`:
 * покраснел «открытие списка пишет одно событие» (0 вызовов). Возвращено — зелёный.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const recordPdAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findMany: bookingFindMany },
    provider: { findUnique: vi.fn(async () => ({ studioId: null })) },
    userProfile: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/audit/pd-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit/pd-access")>()),
  recordPdAccess,
}));

import { getMasterClientsView } from "./clients-view.service";

function guestBooking(id: string, phone: string) {
  return {
    id,
    status: "CONFIRMED",
    clientUserId: null,
    clientName: "Гость",
    clientPhone: phone,
    clientNameSnapshot: "Гость",
    clientPhoneSnapshot: phone,
    startAtUtc: new Date("2026-09-20T08:00:00Z"),
    createdAt: new Date("2026-09-19T08:00:00Z"),
    source: "ONLINE",
    service: { name: "Маникюр", title: "Маникюр", price: 150_000 },
    serviceItems: [{ titleSnapshot: "Маникюр", priceSnapshot: 150_000 }],
    studioId: null,
    provider: { type: "MASTER", name: "Анна" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingFindMany.mockResolvedValue([
    guestBooking("b1", "+79990000001"),
    guestBooking("b2", "+79990000002"),
  ]);
});

describe("getMasterClientsView — след чтения ПДн", () => {
  it("открытие списка пишет одно событие с актором, числом строк и формой фильтра", async () => {
    const data = await getMasterClientsView({
      providerId: "prov-1",
      actorUserId: "user-1",
      actorIp: "203.0.113.5",
      timezone: "Asia/Yekaterinburg",
      activeTab: "all",
      sort: "recent",
      search: "",
      now: new Date("2026-09-29T08:00:00Z"),
    });

    expect(data.clients).toHaveLength(2);
    expect(recordPdAccess).toHaveBeenCalledTimes(1);
    expect(recordPdAccess).toHaveBeenCalledWith({
      surface: "master.clients.list",
      actorType: "MASTER",
      actorUserId: "user-1",
      entityType: "ClientCard",
      rowCount: 2,
      filterFingerprint: "none",
      scopeProviderId: "prov-1",
      ipAddress: "203.0.113.5",
    });
  });

  it("поиск попадает в форму фильтра, но не его значение", async () => {
    await getMasterClientsView({
      providerId: "prov-1",
      actorUserId: "user-1",
      actorIp: null,
      timezone: "Europe/Moscow",
      activeTab: "all",
      sort: "recent",
      search: "0001",
      now: new Date("2026-09-29T08:00:00Z"),
    });

    const call = recordPdAccess.mock.calls[0]?.[0];
    expect(call).toMatchObject({ rowCount: 1, filterFingerprint: "q" });
    expect(JSON.stringify(call)).not.toContain("0001");
  });
});
