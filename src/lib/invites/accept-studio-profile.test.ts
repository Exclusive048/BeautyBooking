import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * STUDIO-MASTER-PROFILES (этап 4, решение владельца 2026-09-27) — принявший
 * приглашение получает ОТДЕЛЬНЫЙ профиль в студии, а его личный профиль в
 * студию не привязывается.
 *
 * Раньше (STAGED-MASTER-USERNAME) заготовка студии становилась ЛИЧНЫМ
 * профилем принявшего и получала адрес страницы, а у мастера с кабинетом к
 * студии привязывался сам личный профиль: одно расписание, одни правила и одни
 * услуги на две работы.
 *
 * @probe 2026-09-27 — в `acceptStudioInvite` к студии привязан личный профиль
 * (`attachMasterToStudio(…, personalProviderId)` вместо профиля в студии):
 * краснеет «личный профиль в студию не привязывается». Снята проверка другой
 * студии (`otherStudioProfile`): краснеет «профиль в другой студии — отказ».
 * Возвращено — зелёный.
 *
 * Решение владельца 2026-10-14: принять приглашение можно только с кабинетом
 * мастера, где пройдены все «Первые шаги» (`invites/master-readiness.ts`).
 * @probe 2026-10-14 — проверка `readiness.ready` в `acceptStudioInvite` снята:
 * краснеют «шаги не пройдены — отказ» и «кабинета нет — отказ» (приглашение
 * принято, профиль в студии создан). Перенесена после места в команде —
 * краснеет «проверка до места в команде».
 *
 * INVITE-ACCEPT-ATOMIC (2026-10-30): все записи — в одной транзакции, статус
 * приглашения — условно. Здесь — форма шагов на моках (что зовётся с
 * транзакцией, что откатывается отказом); гонки — `accept-atomic.test.ts`.
 * @probe 2026-10-30 — `claimStagedStudioProfileTx` вызван без проверки
 * результата: краснеет «заготовку успели взять — 409». Перехват P2002 снят:
 * краснеет «повтор уникальной строки — 409, а не 500». В отказе снято условие
 * `status: PENDING`: краснеет «отказ — условно»; снята проверка `count === 0`:
 * краснеет «отказ, а приглашение успели принять».
 */

const db = vi.hoisted(() => ({
  inviteFindUnique: vi.fn(),
  inviteUpdateMany: vi.fn(async () => ({ count: 1 })),
  providerFindFirst: vi.fn(),
  providerUpdate: vi.fn(async () => ({ id: "x" })),
  providerFindMany: vi.fn(async () => [] as Array<{ id: string }>),
  providerDeleteMany: vi.fn(async () => ({ count: 1 })),
  masterProfileFindUnique: vi.fn<() => Promise<{ id: string; providerId: string } | null>>(async () => ({
    id: "mp",
    providerId: "personal",
  })),
}));
const readiness = vi.hoisted(() => ({
  resolveMasterInviteReadiness: vi.fn(async () => ({
    hasCabinet: true,
    ready: true,
    doneCount: 7,
    total: 7,
    href: "/cabinet/master/dashboard",
  })),
}));
const teamLimits = vi.hoisted(() => ({
  resolveStudioTeamSeat: vi.fn(async () => ({ providerId: "studio-provider", cap: 20 })),
  assertStudioTeamSeatAvailable: vi.fn(async () => undefined),
}));
const split = vi.hoisted(() => ({
  claimStagedStudioProfileTx: vi.fn(async () => true),
  createStudioMasterProfileTx: vi.fn(async () => "created-studio-profile"),
}));
const attachMasterToStudio = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const locks = vi.hoisted(() => ({
  calls: [] as string[],
  lockInviteAcceptorTx: vi.fn(),
  lockStudioInvitesTx: vi.fn(),
}));

/** Одни и те же функции — и у общего клиента, и у транзакции. */
const tx = vi.hoisted(() => ({
  studioInvite: { findUnique: db.inviteFindUnique, updateMany: db.inviteUpdateMany },
  provider: {
    findFirst: db.providerFindFirst,
    findMany: db.providerFindMany,
    update: db.providerUpdate,
    deleteMany: db.providerDeleteMany,
  },
  masterProfile: { findUnique: db.masterProfileFindUnique },
  studioMembership: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "membership-1" })),
  },
}));
const transaction = vi.hoisted(() => vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)));

vi.mock("@/lib/prisma", () => ({ prisma: { ...tx, $transaction: transaction } }));
vi.mock("@/lib/studios/master-profile-split", () => split);
vi.mock("@/lib/invites/access", () => ({
  resolveInviteAccess: vi.fn(async () => "PHONE_OWNER"),
  normalizeInviteEmail: (value: string | null) => value?.trim().toLowerCase() || null,
}));
vi.mock("@/lib/invites/master-readiness", () => readiness);
vi.mock("@/lib/invites/locks", () => locks);
vi.mock("@/lib/studio/team-limits", () => teamLimits);
vi.mock("@/lib/studios/masters", () => ({ attachMasterToStudio }));
vi.mock("@/lib/auth/roles", () => ({ addRoleToUser: vi.fn(async () => []) }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/media/purge", () => ({ collectProviderMedia: vi.fn(async () => []) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { acceptStudioInvite, rejectStudioInvite } from "@/lib/invites/service";

const USER = {
  id: "user-1",
  phone: "+79991234567",
  phoneVerifiedAt: new Date(),
  email: null,
  emailVerifiedAt: null,
  roles: ["CLIENT" as const],
};

const STAGED = {
  id: "staged",
  ownerUserId: null,
  isPublished: false,
  studioPaused: false,
  publicUsername: null,
  categories: ["Маникюр"],
};

const PENDING_INVITE = {
  id: "invite-1",
  phone: "+79991234567",
  email: null,
  studioId: "studio-1",
  status: "PENDING",
  studio: { providerId: "studio-provider" },
};

/**
 * `provider.findFirst` зовётся по порядку: заготовка по контакту → профиль в
 * ДРУГОЙ студии → свой профиль в ЭТОЙ студии.
 */
function providerLookups(input: { staged?: unknown; other?: unknown; own?: unknown }) {
  db.providerFindFirst
    .mockResolvedValueOnce(input.staged ?? null)
    .mockResolvedValueOnce(input.other ?? null)
    .mockResolvedValueOnce(input.own ?? null);
}

function expectNothingJoined() {
  expect(split.claimStagedStudioProfileTx).not.toHaveBeenCalled();
  expect(split.createStudioMasterProfileTx).not.toHaveBeenCalled();
  expect(attachMasterToStudio).not.toHaveBeenCalled();
  expect(tx.studioMembership.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // очереди `…Once` сбрасываются: невыбранное значение одного теста не уходит в следующий
  for (const fn of [db.providerFindFirst, db.inviteFindUnique, db.inviteUpdateMany, db.masterProfileFindUnique]) {
    fn.mockReset();
  }
  db.inviteFindUnique.mockResolvedValue(PENDING_INVITE);
  locks.calls.length = 0;
  locks.lockInviteAcceptorTx.mockImplementation(async (_tx: unknown, userId: string) => {
    locks.calls.push(`user:${userId}`);
  });
  locks.lockStudioInvitesTx.mockImplementation(async (_tx: unknown, studioId: string) => {
    locks.calls.push(`studio:${studioId}`);
  });
});

describe("acceptStudioInvite — профиль в студии отдельно от личного", () => {
  it("заготовка становится профилем принявшего в студии, адреса страницы не получает", async () => {
    providerLookups({ staged: STAGED });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result.ok).toBe(true);
    expect(split.claimStagedStudioProfileTx).toHaveBeenCalledWith(tx, {
      stagedId: "staged",
      personalId: "personal",
      ownerUserId: "user-1",
    });
    expect(result.ok && result.data.masterProviderId).toBe("staged");
    // адрес страницы у заготовки не появляется ни в одной записи
    for (const call of db.providerUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>) {
      expect(call[0].data).not.toHaveProperty("publicUsername", expect.any(String));
    }
  });

  it("🔴 личный профиль в студию не привязывается", async () => {
    providerLookups({ staged: STAGED });

    await acceptStudioInvite("invite-1", USER);

    expect(attachMasterToStudio).toHaveBeenCalledWith("studio-provider", "staged", tx);
    expect(attachMasterToStudio).not.toHaveBeenCalledWith("studio-provider", "personal", expect.anything());
  });

  it("заготовки нет — профиль в студии создаётся копией личного", async () => {
    providerLookups({});

    const result = await acceptStudioInvite("invite-1", USER);

    expect(split.createStudioMasterProfileTx).toHaveBeenCalledWith(tx, {
      personalId: "personal",
      studioProviderId: "studio-provider",
    });
    expect(result.ok && result.data.masterProviderId).toBe("created-studio-profile");
  });

  it("🔴 активный профиль в другой студии — отказ, ничего не создаётся", async () => {
    providerLookups({ staged: STAGED, other: { id: "other-studio-profile" } });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ALREADY_ASSIGNED" });
    expectNothingJoined();
  });
});

describe("acceptStudioInvite — одна транзакция (INVITE-ACCEPT-ATOMIC)", () => {
  it("🔴 первые инструкции транзакции — блокировка человека, потом студии; статус — условно", async () => {
    providerLookups({ staged: STAGED });

    await acceptStudioInvite("invite-1", USER);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(locks.calls).toEqual(["user:user-1", "studio:studio-1"]);
    expect(locks.lockInviteAcceptorTx).toHaveBeenCalledWith(tx, "user-1");
    expect(db.inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    // блокировки — до любой записи и до проверок «другая студия» / «свой профиль»
    const lockOrder = locks.lockStudioInvitesTx.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(db.inviteUpdateMany.mock.invocationCallOrder[0]);
    expect(lockOrder).toBeLessThan(db.providerFindFirst.mock.invocationCallOrder[0]);
  });

  it("🔴 места считаются ещё раз в транзакции, тем же клиентом", async () => {
    providerLookups({ staged: STAGED });

    await acceptStudioInvite("invite-1", USER);

    expect(teamLimits.assertStudioTeamSeatAvailable).toHaveBeenLastCalledWith(
      { providerId: "studio-provider", cap: 20 },
      tx,
    );
  });

  it("🔴 приглашение успели принять — 409 по факту, профиль не трогается", async () => {
    db.inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    db.inviteFindUnique.mockResolvedValueOnce(PENDING_INVITE).mockResolvedValueOnce({ status: "ACTIVE" });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "INVITE_ALREADY_ACCEPTED" });
    expect(db.providerFindFirst).not.toHaveBeenCalled();
    expectNothingJoined();
  });

  it("приглашение успели отозвать — 409 INVITE_REVOKED", async () => {
    db.inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    db.inviteFindUnique.mockResolvedValueOnce(PENDING_INVITE).mockResolvedValueOnce({ status: "LEFT" });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "INVITE_REVOKED" });
    expectNothingJoined();
  });

  it("🔴 заготовку успели взять — 409, привязки и членства нет", async () => {
    providerLookups({ staged: STAGED });
    split.claimStagedStudioProfileTx.mockResolvedValueOnce(false);

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "CONFLICT" });
    expect(attachMasterToStudio).not.toHaveBeenCalled();
    expect(tx.studioMembership.create).not.toHaveBeenCalled();
  });

  it("🔴 повтор уникальной строки — 409, а не 500", async () => {
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }),
    );

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "CONFLICT" });
    expect(!result.ok && result.message).toMatch(/^Не удалось принять приглашение\./);
  });

  it("конфликт записи (P2034) — тот же 409", async () => {
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "6" }),
    );

    await expect(acceptStudioInvite("invite-1", USER)).resolves.toMatchObject({ status: 409, code: "CONFLICT" });
  });

  it("прочий сбой базы не маскируется под отказ", async () => {
    transaction.mockRejectedValueOnce(new Error("connection lost"));

    await expect(acceptStudioInvite("invite-1", USER)).rejects.toThrow("connection lost");
  });

  it("студия заполнилась, пока ждали блокировку — LIMIT_REACHED из транзакции", async () => {
    const { AppError } = await import("@/lib/api/errors");
    teamLimits.assertStudioTeamSeatAvailable
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppError("Команда заполнена.", 409, "LIMIT_REACHED"));

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "LIMIT_REACHED" });
    expect(db.providerFindFirst).not.toHaveBeenCalled();
    expectNothingJoined();
  });
});

describe("acceptStudioInvite — только с пройденными «Первыми шагами»", () => {
  it("🔴 шаги не пройдены — отказ, в студию ничего не попадает", async () => {
    readiness.resolveMasterInviteReadiness.mockResolvedValueOnce({
      hasCabinet: true,
      ready: false,
      doneCount: 5,
      total: 7,
      href: "/cabinet/master/portfolio?guide=portfolio",
    });
    providerLookups({ staged: STAGED });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ONBOARDING_REQUIRED" });
    expect(!result.ok && result.message).toContain("«Первые шаги»");
    expectNothingJoined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("🔴 кабинета мастера нет — отказ с просьбой его создать; сам он не создаётся", async () => {
    readiness.resolveMasterInviteReadiness.mockResolvedValueOnce({
      hasCabinet: false,
      ready: false,
      doneCount: 0,
      total: 7,
      href: "/cabinet/roles",
    });
    providerLookups({ staged: STAGED });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ONBOARDING_REQUIRED" });
    expect(!result.ok && result.message).toContain("создайте кабинет мастера");
    expect(db.masterProfileFindUnique).not.toHaveBeenCalled();
    expectNothingJoined();
  });

  it("проверка до места в команде: отказ говорит о шагах, а не о полной студии", async () => {
    readiness.resolveMasterInviteReadiness.mockResolvedValueOnce({
      hasCabinet: true,
      ready: false,
      doneCount: 6,
      total: 7,
      href: "/cabinet/master/services?guide=services",
    });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ code: "MASTER_ONBOARDING_REQUIRED" });
    expect(teamLimits.resolveStudioTeamSeat).not.toHaveBeenCalled();
    expect(teamLimits.assertStudioTeamSeatAvailable).not.toHaveBeenCalled();
  });

  it("отозванное приглашение — свой ответ, шаги не проверяются", async () => {
    db.inviteFindUnique.mockResolvedValueOnce({ ...PENDING_INVITE, status: "LEFT" });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ code: "INVITE_REVOKED" });
    expect(readiness.resolveMasterInviteReadiness).not.toHaveBeenCalled();
  });

  it("кабинет удалили между проверкой и принятием — тот же отказ, транзакция откатывается", async () => {
    db.masterProfileFindUnique
      .mockResolvedValueOnce({ id: "mp", providerId: "personal" })
      .mockResolvedValueOnce(null);
    providerLookups({ staged: STAGED });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ONBOARDING_REQUIRED" });
    expectNothingJoined();
  });
});

describe("rejectStudioInvite — условно, как принятие (INVITE-ACCEPT-ATOMIC)", () => {
  it("🔴 отказ — условно: только ожидающее приглашение; ничейная заготовка уходит", async () => {
    db.providerFindMany.mockResolvedValueOnce([{ id: "staged" }]);

    const result = await rejectStudioInvite("invite-1", USER);

    expect(result).toEqual({ ok: true, data: { inviteId: "invite-1" } });
    expect(db.inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "invite-1", status: "PENDING" },
      data: { status: "REJECTED" },
    });
    expect(db.providerDeleteMany).toHaveBeenCalledWith({ where: { id: "staged", ownerUserId: null } });
  });

  it("🔴 отказ, а приглашение успели принять — 409, ничего не удаляется", async () => {
    db.providerFindMany.mockResolvedValueOnce([{ id: "staged" }]);
    db.inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    db.inviteFindUnique.mockResolvedValueOnce(PENDING_INVITE).mockResolvedValueOnce({ status: "ACTIVE" });

    const result = await rejectStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "INVITE_ALREADY_ACCEPTED" });
    expect(db.providerDeleteMany).not.toHaveBeenCalled();
  });

  it("повторный отказ — успех без записи", async () => {
    db.inviteFindUnique.mockResolvedValueOnce({ ...PENDING_INVITE, status: "REJECTED" });

    await expect(rejectStudioInvite("invite-1", USER)).resolves.toEqual({ ok: true, data: { inviteId: "invite-1" } });
    expect(db.inviteUpdateMany).not.toHaveBeenCalled();
  });
});
