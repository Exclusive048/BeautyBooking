import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-MASTER-PROFILES (этап 4) — «окошко освободилось» после отмены
 * студийной записи. Подписки на горящие окошки — у личной страницы мастера;
 * задача строилась по исполнителю (профиль в студии: ни страницы, ни
 * подписчиков), и отмена студийной записи не доходила ни до кого, хотя время
 * человека освободилось. Теперь адресат — личный профиль, если освободившееся
 * время попадает в его личные рабочие часы.
 *
 * @probe 2026-09-27 — выбор адресата заменён на прежний (`const target =
 * performer`): краснеют «студийная запись → подписчики личной страницы»
 * (задача ушла на профиль в студии), «вне личных часов — тишина» и «без личного
 * профиля — тишина». Возвращено — зелёный.
 */

const db = vi.hoisted(() => ({ providerFindUnique: vi.fn() }));
const enqueue = vi.hoisted(() => vi.fn(async (_job: unknown) => undefined));
const resolveMasterWorkWindow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: db.providerFindUnique } } }));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/schedule/master-work-window", () => ({ resolveMasterWorkWindow }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { enqueueSlotFreedJob } from "./slot-freed-enqueue";

const TZ = "Asia/Yekaterinburg";
const personal = { id: "P", name: "Марина", publicUsername: "marina", timezone: TZ, type: "MASTER" };
const studioProfile = { id: "S", name: "Марина", publicUsername: null, timezone: TZ, type: "MASTER" };

// 12:00–13:00 по Екатеринбургу.
const booking = (masterProviderId: string) =>
  ({
    id: "bk-1",
    status: "CONFIRMED",
    providerId: masterProviderId === "S" ? "STUDIO" : "P",
    masterProviderId,
    startAtUtc: new Date("2026-10-06T07:00:00.000Z"),
    endAtUtc: new Date("2026-10-06T08:00:00.000Z"),
    service: { title: null, name: "Маникюр классический" },
  }) as never;

const workDay = { isActive: true, startMinutes: 10 * 60, endMinutes: 19 * 60 };

function enqueuedPayload() {
  const job = enqueue.mock.calls[0]?.[0] as { payload: { providerId: string; serviceName: string | null } } | undefined;
  return job?.payload;
}

beforeEach(() => {
  db.providerFindUnique.mockReset();
  enqueue.mockClear();
  resolveMasterWorkWindow.mockReset();
});

describe("enqueueSlotFreedJob", () => {
  it("личная запись → подписчики личной страницы, как раньше", async () => {
    db.providerFindUnique.mockResolvedValue({ ...personal, masterProfile: { id: "mp" }, owner: null });
    await enqueueSlotFreedJob(booking("P"), null);
    expect(enqueuedPayload()).toMatchObject({ providerId: "P", serviceName: "Маникюр классический" });
    expect(resolveMasterWorkWindow).not.toHaveBeenCalled();
  });

  it("студийная запись → подписчики личной страницы, если он в это время работает лично", async () => {
    db.providerFindUnique.mockResolvedValue({
      ...studioProfile,
      masterProfile: null,
      owner: { masterProfile: { provider: personal } },
    });
    resolveMasterWorkWindow.mockResolvedValue(workDay);
    await enqueueSlotFreedJob(booking("S"), null);
    expect(resolveMasterWorkWindow).toHaveBeenCalledWith("P", "2026-10-06");
    expect(enqueuedPayload()).toMatchObject({ providerId: "P", serviceName: null });
  });

  it("студийная запись вне личных часов — тишина", async () => {
    db.providerFindUnique.mockResolvedValue({
      ...studioProfile,
      masterProfile: null,
      owner: { masterProfile: { provider: personal } },
    });
    resolveMasterWorkWindow.mockResolvedValue({ isActive: false, startMinutes: null, endMinutes: null });
    await enqueueSlotFreedJob(booking("S"), null);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("профиль в студии без личного профиля — тишина", async () => {
    db.providerFindUnique.mockResolvedValue({ ...studioProfile, masterProfile: null, owner: { masterProfile: null } });
    await enqueueSlotFreedJob(booking("S"), null);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
