import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STAGED-MASTER-USERNAME — мастер, принявший приглашение на заготовку (студия
 * создала её до его регистрации), получает адрес страницы так же, как при
 * обычном создании кабинета: из СВОЕГО имени, через `generateUniqueMasterUsername`.
 * Раньше адреса не было: личная карточка в команде студии вела на `#`.
 *
 * @probe 2026-09-24 — убрано `...usernameData` из записи заготовки: красный
 * «адрес назначается из имени принявшего». Условие `stagedMaster.publicUsername`
 * заменено на `false` (генерировать всегда): красный «существующий адрес не
 * перезаписывается». Возвращено — зелёный.
 */

const db = vi.hoisted(() => ({
  inviteFindUnique: vi.fn(),
  providerFindFirst: vi.fn(),
  providerUpdate: vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(
    async () => ({ id: "staged" }),
  ),
  masterProfileFindUnique: vi.fn(async () => null),
  masterProfileCreate: vi.fn(async () => ({ providerId: "staged" })),
  userProfileFindUnique: vi.fn(async () => ({ firstName: "Анна", lastName: "Петрова" })),
  transaction: vi.fn(async () => "membership-1"),
}));
const generateUniqueMasterUsername = vi.hoisted(() => vi.fn(async () => "anna-beauty"));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studioInvite: { findUnique: db.inviteFindUnique },
    provider: { findFirst: db.providerFindFirst, update: db.providerUpdate },
    masterProfile: { findUnique: db.masterProfileFindUnique, create: db.masterProfileCreate },
    userProfile: { findUnique: db.userProfileFindUnique },
    $transaction: db.transaction,
  },
}));
vi.mock("@/lib/publicUsername", () => ({ generateUniqueMasterUsername }));
vi.mock("@/lib/invites/access", () => ({
  resolveInviteAccess: vi.fn(async () => "PHONE_OWNER"),
  normalizeInviteEmail: (value: string | null) => value?.trim().toLowerCase() || null,
}));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/studios/masters", () => ({ attachMasterToStudio: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth/roles", () => ({ addRoleToUser: vi.fn(async () => []) }));
vi.mock("@/lib/profiles/professional", () => ({ createMasterProfile: vi.fn() }));
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

function stagedMaster(overrides: Record<string, unknown> = {}) {
  return {
    id: "staged",
    ownerUserId: null,
    isPublished: false,
    studioPaused: false,
    publicUsername: null,
    categories: ["Маникюр"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.inviteFindUnique.mockResolvedValue({
    id: "invite-1",
    phone: "+79991234567",
    email: null,
    studioId: "studio-1",
    status: "PENDING",
    studio: { providerId: "studio-provider" },
  });
});

describe("acceptStudioInvite — адрес страницы у заготовки", () => {
  it("адрес назначается из имени принявшего, как при обычном создании кабинета", async () => {
    db.providerFindFirst.mockResolvedValue(stagedMaster());

    const result = await acceptStudioInvite("invite-1", USER);

    expect(result.ok).toBe(true);
    expect(generateUniqueMasterUsername).toHaveBeenCalledWith(expect.anything(), {
      firstName: "Анна",
      lastName: "Петрова",
      serviceCategory: "Маникюр",
    });
    const update = db.providerUpdate.mock.calls[0]![0];
    expect(update.data).toMatchObject({ ownerUserId: "user-1", publicUsername: "anna-beauty" });
    expect(update.data.publicUsernameUpdatedAt).toBeInstanceOf(Date);
  });

  it("существующий адрес заготовки не перезаписывается", async () => {
    db.providerFindFirst.mockResolvedValue(stagedMaster({ publicUsername: "given-by-studio" }));

    await acceptStudioInvite("invite-1", USER);

    expect(generateUniqueMasterUsername).not.toHaveBeenCalled();
    const update = db.providerUpdate.mock.calls[0]![0];
    expect(update.data).not.toHaveProperty("publicUsername");
  });
});
