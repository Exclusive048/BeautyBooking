import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DELETION-03 — поведение процедур удаления КАБИНЕТОВ (до этого теста их не
 * проверяло ничего: `delete-account.test.ts` их мокает).
 *
 * Двойник Prisma — прокси, который записывает каждый вызов `model.method(args)`
 * и отвечает нейтрально (пустые списки, нулевые счётчики), кроме явно
 * заданных ответов. Так тест смотрит на ФАКТ операций, не перечисляя заранее
 * весь десяток моделей, которые трогает удаление.
 */

type Call = { model: string; method: string; args: unknown };

const h = vi.hoisted(() => {
  const calls: Call[] = [];
  const answers = new Map<string, (args: unknown) => unknown>();
  const neutral = (method: string) => {
    if (method === "findMany") return [];
    if (method === "count") return 0;
    if (method === "findUnique" || method === "findFirst") return null;
    return { count: 0 };
  };
  const client: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, model: string) {
        if (model === "$transaction") {
          return async (cb: (tx: unknown) => unknown) => cb(client);
        }
        return new Proxy(
          {},
          {
            get(_t, method: string) {
              return async (args: unknown) => {
                calls.push({ model, method, args });
                const answer = answers.get(`${model}.${method}`);
                return answer ? answer(args) : neutral(method);
              };
            },
          },
        );
      },
    },
  );
  return { calls, answers, client };
});

const notify = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: h.client }));
vi.mock("@/lib/media/purge", () => ({ collectProviderMedia: vi.fn(async () => []) }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification: notify }));
vi.mock("@/lib/auth/roles", () => ({
  removeProfessionalRoles: vi.fn(),
  hasAnyStudioAffiliation: vi.fn(async () => false),
}));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { deleteMasterCabinet } from "@/lib/deletion/delete-master";
import { deleteStudioCabinet } from "@/lib/deletion/delete-studio";
import { DELETION_BLOCKING_STATUSES } from "@/lib/deletion/active-bookings";

const USER = "user-1";

function callsOf(model: string, method: string): unknown[] {
  return h.calls.filter((c) => c.model === model && c.method === method).map((c) => c.args);
}

beforeEach(() => {
  h.calls.length = 0;
  h.answers.clear();
  notify.mockReset();
});

describe("DELETION-03 · какие записи блокируют удаление", () => {
  it("живые статусы выведены из нормализации: перенос на согласовании и предоплата — тоже живые", () => {
    expect(DELETION_BLOCKING_STATUSES).toEqual(
      expect.arrayContaining(["NEW", "PENDING", "CONFIRMED", "CHANGE_REQUESTED", "PREPAID", "STARTED", "IN_PROGRESS"]),
    );
    for (const done of ["FINISHED", "REJECTED", "CANCELLED", "NO_SHOW"]) {
      expect(DELETION_BLOCKING_STATUSES).not.toContain(done);
    }
  });
});

describe("deleteMasterCabinet", () => {
  beforeEach(() => {
    h.answers.set("masterProfile.findUnique", () => ({
      id: "mp",
      providerId: "prov-m",
      provider: { id: "prov-m", name: "Анна" },
    }));
  });

  it("живая запись → 409 ACTIVE_BOOKINGS и ни одной удаляющей операции", async () => {
    h.answers.set("booking.count", () => 1);
    await expect(deleteMasterCabinet(USER)).rejects.toMatchObject({ code: "ACTIVE_BOOKINGS" });
    expect(h.calls.some((c) => c.method === "deleteMany" || c.method === "delete")).toBe(false);
  });

  it("владелец студии, удаливший кабинет мастера, остаётся владельцем: уходит только роль MASTER", async () => {
    h.answers.set("studioMembership.findMany", () => [
      { id: "own", roles: ["OWNER", "MASTER"] },
      { id: "team", roles: ["MASTER"] },
    ]);
    await deleteMasterCabinet(USER);

    expect(callsOf("studioMembership", "update")).toEqual([{ where: { id: "own" }, data: { roles: ["OWNER"] } }]);
    expect(callsOf("studioMembership", "delete")).toEqual([{ where: { id: "team" } }]);
    expect(callsOf("studioMembership", "deleteMany")).toEqual([]);
    expect(callsOf("studioMember", "deleteMany")).toEqual([{ where: { userId: USER, role: "MASTER" } }]);
  });

  // STUDIO-MASTER-PROFILES (этап 4): у мастера может быть профиль в студии —
  // та же строка владельца без `MasterProfile`. Удаление кабинета мастера
  // закрывает и его.
  it("живая запись профиля мастера в студии тоже блокирует удаление", async () => {
    h.answers.set("provider.findMany", () => [{ id: "prov-s" }]);
    h.answers.set("booking.count", (args) => (JSON.stringify(args).includes("prov-s") ? 1 : 0));
    await expect(deleteMasterCabinet(USER)).rejects.toMatchObject({ code: "ACTIVE_BOOKINGS" });
    expect(h.calls.some((c) => c.method === "deleteMany" || c.method === "delete")).toBe(false);
  });

  it("профиль мастера в студии отвязывается от владельца и студии, его связи с услугами студии уходят", async () => {
    h.answers.set("provider.findMany", () => [{ id: "prov-s" }]);
    await deleteMasterCabinet(USER);

    const studioUpdate = (callsOf("provider", "update") as Array<{ where: { id: string }; data: Record<string, unknown> }>)
      .find((call) => call.where.id === "prov-s");
    expect(studioUpdate?.data).toMatchObject({ ownerUserId: null, studioId: null, isPublished: false });
    expect(callsOf("masterService", "deleteMany")).toContainEqual({ where: { masterProviderId: "prov-s" } });
  });

  it("отзывы, написанные пользователем как клиентом, не трогаются", async () => {
    await deleteMasterCabinet(USER);
    expect(callsOf("review", "deleteMany")).toEqual([]);
  });

  it("владелец отвязывается, пакеты удаляются, услуги с историей снимаются с продажи, автопродление гасится", async () => {
    await deleteMasterCabinet(USER);

    const providerUpdate = callsOf("provider", "update")[0] as { data: Record<string, unknown> };
    expect(providerUpdate.data.ownerUserId).toBeNull();
    expect(callsOf("servicePackage", "deleteMany")).toEqual([{ where: { masterId: "prov-m" } }]);
    expect(callsOf("service", "updateMany")).toEqual([{ where: { providerId: "prov-m" }, data: { isActive: false } }]);
    expect(callsOf("userSubscription", "updateMany")).toEqual([
      {
        where: { userId: USER, scope: "MASTER", autoRenew: true },
        data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null },
      },
    ]);
  });

  it("silent — без уведомления", async () => {
    await deleteMasterCabinet(USER, { silent: true });
    expect(notify).not.toHaveBeenCalled();
    await deleteMasterCabinet(USER);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("deleteStudioCabinet", () => {
  beforeEach(() => {
    h.answers.set("studio.findFirst", () => ({
      id: "st",
      providerId: "prov-s",
      ownerUserId: USER,
      provider: { id: "prov-s", name: "Студия" },
    }));
  });

  it("блокируют только записи, видимые студии — не записи мастеров с их личных страниц", async () => {
    await deleteStudioCabinet(USER);
    const where = JSON.stringify(callsOf("booking", "count")[0]);
    expect(where).toContain('"studioId":"st"');
    // 29.09 · 08: скоуп студии — только studioId (поверхность), без OR по providerId.
    expect(where).not.toContain('"providerId":"prov-s"');
    expect(where).not.toContain("masterProviderId");
  });

  it("CRM студии, пакеты, расписание и офферы студии удаляются; владелец отвязывается; автопродление гасится", async () => {
    await deleteStudioCabinet(USER);

    expect(callsOf("clientCard", "deleteMany")).toEqual([{ where: { providerId: "prov-s" } }]);
    expect(callsOf("servicePackage", "deleteMany")).toEqual([{ where: { masterId: "prov-s" } }]);
    for (const model of ["hotSlot", "scheduleOverride", "scheduleBreak", "weeklyScheduleConfig", "scheduleTemplate"]) {
      expect(callsOf(model, "deleteMany"), model).toEqual([{ where: { providerId: "prov-s" } }]);
    }
    expect(callsOf("modelOffer", "deleteMany")).toEqual([{ where: { masterId: "prov-s" } }]);
    const providerUpdate = callsOf("provider", "update")[0] as { data: Record<string, unknown> };
    expect(providerUpdate.data.ownerUserId).toBeNull();
    expect(callsOf("userSubscription", "updateMany")).toEqual([
      {
        where: { userId: USER, scope: "STUDIO", autoRenew: true },
        data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null },
      },
    ]);
  });

  it("приглашённые-заглушки (без владельца) снимаются с витрины и теряют контакты", async () => {
    await deleteStudioCabinet(USER);
    expect(callsOf("provider", "updateMany")[0]).toEqual({
      where: { studioId: "prov-s", type: "MASTER", ownerUserId: null },
      data: { isPublished: false, contactName: null, contactPhone: null, contactEmail: null },
    });
  });

  it("silent — владельцу уведомление не шлётся", async () => {
    await deleteStudioCabinet(USER, { silent: true });
    expect(notify).not.toHaveBeenCalled();
  });
});
