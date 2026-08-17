import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-28 — в ветке `/api/studios/[id]/**` сегмент означает `Provider.id`: так
 * его трактует `ensureStudioAccess` (`lib/studios/access.ts:9-11`) и так его
 * шлют все клиентские вызывающие. `/leave` единственный читал его как
 * `Studio.id`. Эксплуатируемости не было — дальше всё скоупится на
 * `auth.user.id`, — но это ловушка «two id systems» из `lib/studio/tenancy.ts`.
 *
 * Тест пиннит именно СЕМАНТИКУ сегмента: по какому полю роут ищет студию.
 * Проверять «ушёл/не ушёл» здесь незачем — это поведение фикс не трогал.
 */

const { studioFindUnique, membershipFindFirst, membershipUpdate, providerUpdateMany, userFindUnique } =
  vi.hoisted(() => ({
    studioFindUnique: vi.fn(),
    membershipFindFirst: vi.fn(),
    membershipUpdate: vi.fn(),
    providerUpdateMany: vi.fn(),
    userFindUnique: vi.fn(),
  }));

const requireAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    studioMembership: { findFirst: membershipFindFirst, update: membershipUpdate },
    provider: { updateMany: providerUpdateMany },
    userProfile: { findUnique: userFindUnique },
  },
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth }));
vi.mock("@/lib/notifications/studio-notifications", () => ({
  notifyStudioMemberLeft: vi.fn(),
}));
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError: vi.fn() };
});

import { MembershipStatus, StudioRole } from "@prisma/client";
import { POST } from "./route";

const PROVIDER_ID = "provider-1";

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ ok: true, user: { id: "user-1" } });
  userFindUnique.mockResolvedValue(null);
});

function request() {
  return POST(new Request("http://localhost/api/studios/x/leave", { method: "POST" }), {
    params: Promise.resolve({ id: PROVIDER_ID }),
  });
}

describe("POST /api/studios/[id]/leave — семантика [id] (SEC-28)", () => {
  it("ищет студию по Provider.id, как все соседние роуты ветки", async () => {
    studioFindUnique.mockResolvedValue(null);

    await request();

    expect(studioFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerId: PROVIDER_ID } }),
    );
  });

  it("не принимает Studio.id — двусмысленность и была находкой", async () => {
    studioFindUnique.mockResolvedValue(null);

    const res = await request();

    expect(res.status).toBe(404);
    // ключ `id` в where означал бы, что роут по-прежнему читает Studio.id
    expect(studioFindUnique.mock.calls[0][0].where).not.toHaveProperty("id");
  });

  it("на найденной студии продолжает работать как раньше", async () => {
    studioFindUnique.mockResolvedValue({
      id: "studio-1",
      providerId: PROVIDER_ID,
      ownerUserId: null,
      provider: { name: "Vision", ownerUserId: null },
    });
    membershipFindFirst.mockResolvedValue({ id: "m-1", roles: [StudioRole.MASTER] });
    membershipUpdate.mockResolvedValue({});
    providerUpdateMany.mockResolvedValue({ count: 1 });

    const res = await request();

    expect(res.status).toBe(200);
    // членство ищется по Studio.id, а провайдер откручивается по Provider.id —
    // обе системы используются по назначению, а не вперемешку
    expect(membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studioId: "studio-1", userId: "user-1", status: MembershipStatus.ACTIVE },
      }),
    );
    expect(providerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studioId: PROVIDER_ID, ownerUserId: "user-1" }),
      }),
    );
  });
});
