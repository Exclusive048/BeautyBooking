import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RESCHEDULE-SELF-SLOT — право исключить бронь из занятого времени.
 *
 * Исключённая бронь показывает своё окно свободным, то есть выдаёт время
 * чужой записи по её id. Поэтому: клиент брони — да; владелец кабинета /
 * админ студии — да (через `requireProviderOwner`); посторонний — 403; бронь
 * другого исполнителя — 404 (исключение ничего не значило бы и молча
 * искажало выдачу); без параметра — `undefined`, без обращения к сессии.
 *
 * @probe убрана проверка `performsHere` → кейс «чужой исполнитель» красный;
 * убран `if (booking.clientUserId === user.userId) return` → кейс «клиент
 * брони» падает 403.
 */

const prismaMock = vi.hoisted(() => ({ booking: { findUnique: vi.fn() } }));
const getSessionUser = vi.hoisted(() => vi.fn());
const requireProviderOwner = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/access", () => ({ getSessionUser }));
vi.mock("@/lib/auth/ownership", () => ({ requireProviderOwner }));

import { AppError } from "@/lib/api/errors";
import { resolveRescheduleExclusion } from "@/lib/schedule/reschedule-exclusion";

const REQ = new Request("http://localhost/api/masters/m1/availability");
const MASTER = "prov_master";
const NO_SNAPSHOTS = { serviceItems: [], startAtUtc: null, endAtUtc: null };
const STUDIO = "prov_studio";

describe("RESCHEDULE-SELF-SLOT · resolveRescheduleExclusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUser.mockResolvedValue({ userId: "u_client", roles: ["CLIENT"] });
    requireProviderOwner.mockRejectedValue(new AppError("Недостаточно прав.", 403, "FORBIDDEN"));
  });

  it("без параметра — undefined и никакой сессии", async () => {
    await expect(resolveRescheduleExclusion(REQ, MASTER, null)).resolves.toBeUndefined();
    await expect(resolveRescheduleExclusion(REQ, MASTER, "  ")).resolves.toBeUndefined();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("клиент своей брони получает исключение", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk1",
      clientUserId: "u_client",
      providerId: MASTER,
      masterProviderId: null,
      ...NO_SNAPSHOTS,
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk1")).resolves.toMatchObject({ bookingId: "bk1" });
    expect(requireProviderOwner).not.toHaveBeenCalled();
  });

  it("сторона провайдера — через requireProviderOwner (студийная бронь: исполнитель, затем студия)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk2",
      clientUserId: "u_other",
      providerId: STUDIO,
      masterProviderId: MASTER,
      ...NO_SNAPSHOTS,
    });
    requireProviderOwner
      .mockRejectedValueOnce(new AppError("Недостаточно прав.", 403, "FORBIDDEN"))
      .mockResolvedValueOnce(undefined);

    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk2")).resolves.toMatchObject({ bookingId: "bk2" });
    expect(requireProviderOwner).toHaveBeenNthCalledWith(1, expect.anything(), MASTER);
    expect(requireProviderOwner).toHaveBeenNthCalledWith(2, expect.anything(), STUDIO);
  });

  it("посторонний — 403", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk3",
      clientUserId: "u_other",
      providerId: MASTER,
      masterProviderId: null,
      ...NO_SNAPSHOTS,
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk3")).rejects.toMatchObject({ status: 403 });
  });

  it("бронь другого исполнителя — 404, даже для её клиента", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk4",
      clientUserId: "u_client",
      providerId: "prov_elsewhere",
      masterProviderId: null,
      ...NO_SNAPSHOTS,
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk4")).rejects.toMatchObject({
      status: 404,
      code: "BOOKING_NOT_FOUND",
    });
  });

  /**
   * MOVE-PICKER-DURATION — окошки переноса считаются по длине самой записи
   * (снимки услуг), как её проверит перенос, а не по текущей длительности
   * услуги.
   *
   * @probe 2026-09-23 — `durationMin` отдавался `0` всегда (роуты брали
   * длительность услуги): красный «длина — сумма снимков». Возвращено — зелёный.
   */
  it("длина переносимой записи — сумма снимков услуг, без них — текущее окно", async () => {
    prismaMock.booking.findUnique.mockResolvedValueOnce({
      id: "bk5",
      clientUserId: "u_client",
      providerId: MASTER,
      masterProviderId: null,
      serviceItems: [{ durationSnapshotMin: 45 }, { durationSnapshotMin: 30 }],
      startAtUtc: new Date("2026-10-01T09:00:00Z"),
      endAtUtc: new Date("2026-10-01T10:00:00Z"),
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk5")).resolves.toEqual({ bookingId: "bk5", durationMin: 75 });

    prismaMock.booking.findUnique.mockResolvedValueOnce({
      id: "bk6",
      clientUserId: "u_client",
      providerId: MASTER,
      masterProviderId: null,
      serviceItems: [],
      startAtUtc: new Date("2026-10-01T09:00:00Z"),
      endAtUtc: new Date("2026-10-01T10:30:00Z"),
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk6")).resolves.toEqual({ bookingId: "bk6", durationMin: 90 });
  });
});
