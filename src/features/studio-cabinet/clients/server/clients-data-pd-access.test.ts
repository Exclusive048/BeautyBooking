import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-5 — страница «Клиенты» студии пишет след массового
 * чтения ПДн (`PdAccessLog`, RKN-FIX-10). До этого его писал только
 * `GET /api/studio/clients`, который интерфейс не вызывает.
 *
 * @probe 2026-09-29 — вызов `recordPdAccess` удалён из `loadStudioClientsData`:
 * покраснел «открытие списка пишет одно событие» (0 вызовов). Возвращено — зелёный.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const recordPdAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: {
      findUnique: vi.fn(async () => ({
        id: "studio-1",
        providerId: "studio-prov-1",
        provider: { timezone: "Asia/Yekaterinburg" },
      })),
    },
    booking: { findMany: bookingFindMany },
    provider: { findMany: vi.fn(async () => []) },
    userProfile: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/audit/pd-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit/pd-access")>()),
  recordPdAccess,
}));

import { loadStudioClientsData } from "./clients-data.service";

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
    masterProviderId: null,
    service: { name: "Стрижка", title: "Стрижка", price: 200_000 },
    serviceItems: [{ titleSnapshot: "Стрижка", priceSnapshot: 200_000 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingFindMany.mockResolvedValue([
    guestBooking("b1", "+79990000001"),
    guestBooking("b2", "+79990000002"),
    guestBooking("b3", "+79990000003"),
  ]);
});

describe("loadStudioClientsData — след чтения ПДн", () => {
  it("открытие списка пишет одно событие с актором, числом строк и формой фильтра", async () => {
    const data = await loadStudioClientsData({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: "203.0.113.7",
      segment: "all",
    });

    expect(data.items).toHaveLength(3);
    expect(recordPdAccess).toHaveBeenCalledTimes(1);
    expect(recordPdAccess).toHaveBeenCalledWith({
      surface: "studio.clients.list",
      actorType: "STUDIO",
      actorUserId: "owner-1",
      entityType: "ClientCard",
      rowCount: 3,
      filterFingerprint: "none|limit=50",
      scopeStudioId: "studio-1",
      ipAddress: "203.0.113.7",
    });
  });

  it("поиск и мастер попадают в форму фильтра без значений", async () => {
    await loadStudioClientsData({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: null,
      segment: "all",
      search: "0002",
      masterId: "master-9",
    });

    const call = recordPdAccess.mock.calls[0]?.[0];
    expect(call).toMatchObject({ filterFingerprint: "master+q|limit=50" });
    expect(JSON.stringify(call)).not.toContain("0002");
    expect(JSON.stringify(call)).not.toContain("master-9");
  });
});
