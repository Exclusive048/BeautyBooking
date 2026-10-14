import { beforeEach, describe, expect, it, vi } from "vitest";

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
 */

const db = vi.hoisted(() => ({
  inviteFindUnique: vi.fn(),
  providerFindFirst: vi.fn(),
  providerUpdate: vi.fn(async () => ({ id: "x" })),
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
const teamLimits = vi.hoisted(() => ({ ensureStudioTeamLimit: vi.fn(async () => undefined) }));
const split = vi.hoisted(() => ({
  claimStagedStudioProfileTx: vi.fn(async () => undefined),
  createStudioMasterProfileTx: vi.fn(async () => "created-studio-profile"),
}));
const attachMasterToStudio = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

const tx = {
  studioMembership: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "membership-1" })),
  },
  studioInvite: { update: vi.fn(async () => ({ id: "invite-1" })) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studioInvite: { findUnique: db.inviteFindUnique },
    provider: { findFirst: db.providerFindFirst, update: db.providerUpdate },
    masterProfile: { findUnique: db.masterProfileFindUnique },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/studios/master-profile-split", () => split);
vi.mock("@/lib/invites/access", () => ({
  resolveInviteAccess: vi.fn(async () => "PHONE_OWNER"),
  normalizeInviteEmail: (value: string | null) => value?.trim().toLowerCase() || null,
}));
vi.mock("@/lib/invites/master-readiness", () => readiness);
vi.mock("@/lib/studio/team-limits", () => teamLimits);
vi.mock("@/lib/studios/masters", () => ({ attachMasterToStudio }));
vi.mock("@/lib/auth/roles", () => ({ addRoleToUser: vi.fn(async () => []) }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/media/purge", () => ({ collectProviderMedia: vi.fn(async () => []) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { acceptStudioInvite } from "@/lib/invites/service";

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

beforeEach(() => {
  vi.clearAllMocks();
  db.providerFindFirst.mockReset();
  db.inviteFindUnique.mockResolvedValue({
    id: "invite-1",
    phone: "+79991234567",
    email: null,
    studioId: "studio-1",
    status: "PENDING",
    studio: { providerId: "studio-provider" },
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
    db.masterProfileFindUnique.mockResolvedValueOnce({ id: "mp", providerId: "personal" });
    providerLookups({ staged: STAGED });

    await acceptStudioInvite("invite-1", USER);

    expect(attachMasterToStudio).toHaveBeenCalledWith("studio-provider", "staged");
    expect(attachMasterToStudio).not.toHaveBeenCalledWith("studio-provider", "personal");
  });

  it("заготовки нет — профиль в студии создаётся копией личного", async () => {
    db.masterProfileFindUnique.mockResolvedValueOnce({ id: "mp", providerId: "personal" });
    providerLookups({});

    const result = await acceptStudioInvite("invite-1", USER);

    expect(split.createStudioMasterProfileTx).toHaveBeenCalledWith(tx, {
      personalId: "personal",
      studioProviderId: "studio-provider",
    });
    expect(result.ok && result.data.masterProviderId).toBe("created-studio-profile");
  });

  it("🔴 активный профиль в другой студии — отказ, ничего не создаётся", async () => {
    db.masterProfileFindUnique.mockResolvedValueOnce({ id: "mp", providerId: "personal" });
    providerLookups({ staged: STAGED, other: { id: "other-studio-profile" } });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ALREADY_ASSIGNED" });
    expect(split.claimStagedStudioProfileTx).not.toHaveBeenCalled();
    expect(split.createStudioMasterProfileTx).not.toHaveBeenCalled();
  });
});

describe("acceptStudioInvite — только с пройденными «Первыми шагами»", () => {
  function expectNothingJoined() {
    expect(split.claimStagedStudioProfileTx).not.toHaveBeenCalled();
    expect(split.createStudioMasterProfileTx).not.toHaveBeenCalled();
    expect(attachMasterToStudio).not.toHaveBeenCalled();
    expect(tx.studioInvite.update).not.toHaveBeenCalled();
  }

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
    expect(teamLimits.ensureStudioTeamLimit).not.toHaveBeenCalled();
  });

  it("отозванное приглашение — свой ответ, шаги не проверяются", async () => {
    db.inviteFindUnique.mockResolvedValueOnce({
      id: "invite-1",
      phone: "+79991234567",
      email: null,
      studioId: "studio-1",
      status: "LEFT",
      studio: { providerId: "studio-provider" },
    });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ code: "INVITE_REVOKED" });
    expect(readiness.resolveMasterInviteReadiness).not.toHaveBeenCalled();
  });

  it("кабинет удалили между проверкой и принятием — тот же отказ", async () => {
    db.masterProfileFindUnique.mockResolvedValueOnce(null);
    providerLookups({ staged: STAGED });

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ONBOARDING_REQUIRED" });
    expectNothingJoined();
  });
});
