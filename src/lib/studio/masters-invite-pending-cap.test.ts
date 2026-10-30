import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembershipStatus } from "@prisma/client";

/**
 * STUDIO-INVITE-LIMITS (D-03) — `createStudioMaster`: потолок НЕОТВЕЧЕННЫХ
 * приглашений студии. Пины: блокировка студии — первая инструкция транзакции
 * (иначе два параллельных запроса пройдут подсчёт вместе); считается только
 * приглашение, которое становится ожидающим (повтор на ожидающий адрес — нет);
 * на пределе — 409 `STUDIO_INVITES_PENDING_LIMIT` и ничего не пишется.
 *
 * Ограничение: это мок Prisma — сериализацию даёт `pg_advisory_xact_lock` на
 * живой базе, тест проверяет только, что она взята и взята первой.
 */

const calls: string[] = [];
const studioFindUnique = vi.hoisted(() => vi.fn());
const executeRaw = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const providerCreate = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn());
const inviteFindUnique = vi.hoisted(() => vi.fn());
const inviteCount = vi.hoisted(() => vi.fn());
const inviteUpsert = vi.hoisted(() => vi.fn());
const getStudioPendingInviteCap = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: executeRaw,
    provider: { findFirst: providerFindFirst, create: providerCreate, update: providerUpdate },
    studioInvite: { findUnique: inviteFindUnique, count: inviteCount, upsert: inviteUpsert },
  };
  return {
    prisma: {
      studio: { findUnique: studioFindUnique },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});
vi.mock("@/lib/invites/service", () => ({ discardStagedMaster: vi.fn() }));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit: vi.fn(), getStudioPendingInviteCap }));

import { createStudioMaster } from "@/lib/studio/masters.service";

const input = {
  studioId: "studio-1",
  displayName: "Анна",
  email: "anna@example.com",
  title: "Маникюр",
  invitedByUserId: "user-1",
};

const defaults: Record<string, () => unknown> = {};

/** Мок пишет своё имя в `calls` — порядок инструкций транзакции. */
function track(name: string, fn: ReturnType<typeof vi.fn>) {
  fn.mockImplementation(async () => {
    calls.push(name);
    return defaults[name]?.();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  studioFindUnique.mockResolvedValue({ id: "studio-1", providerId: "provider-s1", provider: { timezone: "Asia/Yekaterinburg" } });
  getStudioPendingInviteCap.mockResolvedValue(10);
  defaults.lock = () => 1;
  defaults.findStub = () => null;
  defaults.findInvite = () => null;
  defaults.count = () => 3;
  defaults.create = () => ({ id: "m-new" });
  defaults.update = () => ({ id: "m-old" });
  defaults.upsert = () => ({ id: "inv-1" });
  track("lock", executeRaw);
  track("findStub", providerFindFirst);
  track("findInvite", inviteFindUnique);
  track("count", inviteCount);
  track("create", providerCreate);
  track("update", providerUpdate);
  track("upsert", inviteUpsert);
});

describe("createStudioMaster — pending invite cap", () => {
  it("locks the studio first, counts pending invites, then writes", async () => {
    await expect(createStudioMaster(input)).resolves.toEqual({
      id: "m-new",
      inviteId: "inv-1",
      shouldNotifyInvite: true,
    });

    expect(calls).toEqual(["lock", "findStub", "findInvite", "count", "create", "upsert"]);
    const [strings, key] = executeRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(strings.join("?")).toContain("pg_advisory_xact_lock");
    expect(key).toBe("studio-invites:studio-1");
    expect(inviteCount).toHaveBeenCalledWith({
      where: { studioId: "studio-1", status: MembershipStatus.PENDING },
    });
  });

  it("refuses at the cap with an actionable 409 and writes nothing", async () => {
    defaults.count = () => 10;

    await expect(createStudioMaster(input)).rejects.toMatchObject({
      status: 409,
      code: "STUDIO_INVITES_PENDING_LIMIT",
      details: { max: 10, current: 10 },
      message: expect.stringMatching(/Отзовите/),
    });
    expect(providerCreate).not.toHaveBeenCalled();
    expect(inviteUpsert).not.toHaveBeenCalled();
  });

  it("re-opens a rejected or revoked invite only under the cap", async () => {
    defaults.findInvite = () => ({ id: "inv-1", status: MembershipStatus.REJECTED });
    defaults.count = () => 10;

    await expect(createStudioMaster(input)).rejects.toMatchObject({ code: "STUDIO_INVITES_PENDING_LIMIT" });
  });

  it("does not count a repeat on an address that is already pending (no new email)", async () => {
    defaults.findStub = () => ({ id: "m-old", ownerUserId: null });
    defaults.findInvite = () => ({ id: "inv-1", status: MembershipStatus.PENDING });
    defaults.count = () => 10;

    await expect(createStudioMaster(input)).resolves.toEqual({
      id: "m-old",
      inviteId: "inv-1",
      shouldNotifyInvite: false,
    });
    expect(inviteCount).not.toHaveBeenCalled();
  });

  it("refuses an accepted master before counting", async () => {
    defaults.findStub = () => ({ id: "m-old", ownerUserId: "user-2" });

    await expect(createStudioMaster(input)).rejects.toMatchObject({ status: 409, code: "ALREADY_EXISTS" });
    expect(inviteCount).not.toHaveBeenCalled();
  });
});
