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
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk1")).resolves.toBe("bk1");
    expect(requireProviderOwner).not.toHaveBeenCalled();
  });

  it("сторона провайдера — через requireProviderOwner (студийная бронь: исполнитель, затем студия)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk2",
      clientUserId: "u_other",
      providerId: STUDIO,
      masterProviderId: MASTER,
    });
    requireProviderOwner
      .mockRejectedValueOnce(new AppError("Недостаточно прав.", 403, "FORBIDDEN"))
      .mockResolvedValueOnce(undefined);

    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk2")).resolves.toBe("bk2");
    expect(requireProviderOwner).toHaveBeenNthCalledWith(1, expect.anything(), MASTER);
    expect(requireProviderOwner).toHaveBeenNthCalledWith(2, expect.anything(), STUDIO);
  });

  it("посторонний — 403", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk3",
      clientUserId: "u_other",
      providerId: MASTER,
      masterProviderId: null,
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk3")).rejects.toMatchObject({ status: 403 });
  });

  it("бронь другого исполнителя — 404, даже для её клиента", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: "bk4",
      clientUserId: "u_client",
      providerId: "prov_elsewhere",
      masterProviderId: null,
    });
    await expect(resolveRescheduleExclusion(REQ, MASTER, "bk4")).rejects.toMatchObject({
      status: 404,
      code: "BOOKING_NOT_FOUND",
    });
  });
});
