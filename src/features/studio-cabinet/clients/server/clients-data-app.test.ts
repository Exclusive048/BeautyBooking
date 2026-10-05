import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (G6) — клиенты студии для приложения:
 *  - `loadStudioClientsPage`: та же база, что у веба, страница по смещению,
 *    след `studio.clients.list` с `limit`/`offset` в форме фильтра;
 *  - мастера клиента-гостя считаются по нормализованному номеру (как ключ
 *    строки), а не по сырому — раньше у гостей было «у 0 мастеров»;
 *  - `loadStudioClientDetail`: ровно брони этого ключа в окне CRM, ближайшая
 *    запись, последние визиты, след `studio.clients.detail`.
 */

const studioFindUnique = vi.hoisted(() => vi.fn());
const bookingFindMany = vi.hoisted(() => vi.fn());
const providerFindMany = vi.hoisted(() => vi.fn());
const userProfileFindMany = vi.hoisted(() => vi.fn());
const recordPdAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    booking: { findMany: bookingFindMany },
    provider: { findMany: providerFindMany },
    userProfile: { findMany: userProfileFindMany },
  },
}));
vi.mock("@/lib/audit/pd-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit/pd-access")>()),
  recordPdAccess,
}));

import { decodeOffsetCursor } from "@/lib/pagination/offset-cursor";
import { loadStudioClientDetail, loadStudioClientsPage } from "./clients-data.service";

type BookingPatch = Partial<{
  id: string;
  status: string;
  clientUserId: string | null;
  clientPhone: string;
  clientPhoneSnapshot: string | null;
  clientNameSnapshot: string | null;
  startAtUtc: Date | null;
  masterProviderId: string | null;
  price: number;
}>;

function booking(patch: BookingPatch = {}) {
  const price = patch.price ?? 200_000;
  return {
    id: patch.id ?? "b1",
    status: patch.status ?? "FINISHED",
    clientUserId: patch.clientUserId ?? null,
    clientName: "Гость",
    clientPhone: patch.clientPhone ?? "+79990000001",
    clientNameSnapshot: patch.clientNameSnapshot ?? "Гость",
    clientPhoneSnapshot: patch.clientPhoneSnapshot === undefined ? "+79990000001" : patch.clientPhoneSnapshot,
    startAtUtc: patch.startAtUtc === undefined ? new Date("2026-09-20T08:00:00Z") : patch.startAtUtc,
    createdAt: new Date("2026-09-19T08:00:00Z"),
    masterProviderId: patch.masterProviderId ?? null,
    service: { name: "Стрижка", title: "Стрижка", price },
    serviceItems: [{ titleSnapshot: "Стрижка", priceSnapshot: price }],
  };
}

const NOW = new Date("2026-10-04T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  studioFindUnique.mockResolvedValue({
    id: "studio-1",
    providerId: "prov-s1",
    provider: { timezone: "Asia/Yekaterinburg" },
  });
  providerFindMany.mockResolvedValue([{ id: "prov-m1", name: "Анна", avatarUrl: null }]);
  userProfileFindMany.mockResolvedValue([]);
});

describe("loadStudioClientsPage", () => {
  beforeEach(() => {
    bookingFindMany.mockResolvedValue([
      booking({ id: "b1", clientPhone: "+79990000001", clientPhoneSnapshot: "+79990000001" }),
      booking({ id: "b2", clientPhone: "+79990000002", clientPhoneSnapshot: "+79990000002" }),
      booking({ id: "b3", clientPhone: "+79990000003", clientPhoneSnapshot: "+79990000003" }),
    ]);
  });

  it("первая страница: курсор следующей, total, след с limit", async () => {
    const page = await loadStudioClientsPage({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: "203.0.113.7",
      segment: "all",
      offset: 0,
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.totalCount).toBe(3);
    expect(page.segmentCounts.all).toBe(3);
    expect(page.timezone).toBe("Asia/Yekaterinburg");
    expect(decodeOffsetCursor(page.nextCursor!)).toBe(2);
    expect(recordPdAccess).toHaveBeenCalledWith({
      surface: "studio.clients.list",
      actorType: "STUDIO",
      actorUserId: "owner-1",
      entityType: "ClientCard",
      rowCount: 2,
      filterFingerprint: "none|limit=2",
      scopeStudioId: "studio-1",
      ipAddress: "203.0.113.7",
    });
  });

  it("следующая страница и фильтры — в форме фильтра без значений", async () => {
    const page = await loadStudioClientsPage({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: null,
      segment: "new",
      search: "0000",
      masterId: "prov-m1",
      offset: 2,
      limit: 2,
    });

    expect(page.nextCursor).toBeNull();
    const call = recordPdAccess.mock.calls[0]?.[0];
    expect(call.filterFingerprint).toBe("master+q+segment|limit=2|offset=2");
    expect(JSON.stringify(call)).not.toContain("0000");
    expect(JSON.stringify(call)).not.toContain("prov-m1");
  });

  it("мастера гостя — по нормализованному номеру, как ключ строки", async () => {
    bookingFindMany.mockResolvedValue([
      booking({ id: "b1", clientPhone: "8 999 000-00-01", clientPhoneSnapshot: null, masterProviderId: "prov-m1" }),
    ]);

    const page = await loadStudioClientsPage({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: null,
      segment: "all",
      masterId: "prov-m1",
      offset: 0,
      limit: 30,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      key: "phone:+79990000001",
      mastersCount: 1,
      mainMaster: { id: "prov-m1", displayName: "Анна" },
    });
  });

  it("студии нет — пустая страница без следа", async () => {
    studioFindUnique.mockResolvedValue(null);
    const page = await loadStudioClientsPage({
      studioId: "studio-x",
      actorUserId: "owner-1",
      actorIp: null,
      segment: "all",
      offset: 0,
      limit: 30,
    });
    expect(page).toMatchObject({ items: [], total: 0, totalCount: 0, nextCursor: null });
    expect(recordPdAccess).not.toHaveBeenCalled();
  });
});

describe("loadStudioClientDetail", () => {
  it("гость: только брони его ключа, ближайшая запись, последние визиты, след карточки", async () => {
    bookingFindMany.mockResolvedValue([
      booking({
        id: "next",
        status: "CONFIRMED",
        startAtUtc: new Date("2026-10-06T08:00:00Z"),
        masterProviderId: "prov-m1",
      }),
      booking({ id: "v3", startAtUtc: new Date("2026-09-30T09:00:00Z"), masterProviderId: "prov-m1", price: 150_000 }),
      booking({ id: "v2", startAtUtc: new Date("2026-09-10T09:00:00Z"), masterProviderId: "prov-s1" }),
      booking({ id: "v1", startAtUtc: new Date("2026-08-10T09:00:00Z"), masterProviderId: "prov-gone" }),
      booking({ id: "v0", startAtUtc: new Date("2026-07-10T09:00:00Z") }),
      // Совпал по текущему номеру, но снимок — другой человек: не этот клиент.
      booking({ id: "other", clientPhone: "+79990000001", clientPhoneSnapshot: "+79995555555" }),
    ]);

    const detail = await loadStudioClientDetail({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: "203.0.113.7",
      clientKey: "phone:89990000001",
      now: NOW,
    });

    const where = bookingFindMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain('"clientUserId":null');
    expect(JSON.stringify(where)).toContain("+79990000001");
    expect(JSON.stringify(where)).toContain('"startAtUtc":{"gte"');

    expect(detail).not.toBeNull();
    expect(detail!.timezone).toBe("Asia/Yekaterinburg");
    expect(detail!.client).toMatchObject({
      key: "phone:+79990000001",
      clientUserId: null,
      phone: "+79990000001",
      visitsCount: 4,
      lifetimeKopeks: 750_000,
      mastersCount: 2,
      mainMaster: { id: "prov-m1", displayName: "Анна", avatarUrl: null },
      lastVisitAt: "2026-09-30T09:00:00.000Z",
      firstVisitAt: "2026-07-10T09:00:00.000Z",
    });
    expect(detail!.nextBooking).toEqual({
      id: "next",
      startAtUtc: "2026-10-06T08:00:00.000Z",
      status: "CONFIRMED",
      serviceName: "Стрижка",
      master: { id: "prov-m1", displayName: "Анна" },
    });
    expect(detail!.recentVisits.map((v) => [v.bookingId, v.master?.id ?? null])).toEqual([
      ["v3", "prov-m1"],
      ["v2", null],
      ["v1", null],
    ]);
    expect(detail!.recentVisits[0]!.amountKopeks).toBe(150_000);

    expect(recordPdAccess).toHaveBeenCalledWith({
      surface: "studio.clients.detail",
      actorType: "STUDIO",
      actorUserId: "owner-1",
      entityType: "ClientCard",
      rowCount: 1,
      filterFingerprint: null,
      scopeStudioId: "studio-1",
      ipAddress: "203.0.113.7",
    });
  });

  it("клиент с аккаунтом — по clientUserId, имя из профиля", async () => {
    bookingFindMany.mockResolvedValue([booking({ id: "v1", clientUserId: "u-1" })]);
    userProfileFindMany.mockResolvedValue([{ id: "u-1", displayName: "Мария", firstName: null, lastName: null }]);

    const detail = await loadStudioClientDetail({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: null,
      clientKey: "user:u-1",
      now: NOW,
    });

    expect(JSON.stringify(bookingFindMany.mock.calls[0]![0].where)).toContain('"clientUserId":"u-1"');
    expect(detail!.client).toMatchObject({ key: "user:u-1", clientUserId: "u-1", displayName: "Мария" });
    expect(detail!.nextBooking).toBeNull();
  });

  it("у студии нет такого клиента — null и без следа", async () => {
    bookingFindMany.mockResolvedValue([]);
    const detail = await loadStudioClientDetail({
      studioId: "studio-1",
      actorUserId: "owner-1",
      actorIp: null,
      clientKey: "user:u-x",
      now: NOW,
    });
    expect(detail).toBeNull();
    expect(recordPdAccess).not.toHaveBeenCalled();
  });

  it("неверный ключ — 400 CLIENT_KEY_INVALID без похода в базу", async () => {
    await expect(
      loadStudioClientDetail({ studioId: "studio-1", actorUserId: "owner-1", actorIp: null, clientKey: "", now: NOW }),
    ).rejects.toMatchObject({ status: 400, code: "CLIENT_KEY_INVALID" });
    expect(bookingFindMany).not.toHaveBeenCalled();
  });
});
