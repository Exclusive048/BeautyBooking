import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * 29.09 доработки · 04 — исключение мастера из студии.
 *  - студия — та, что выбрана в кабинете (`studioId` в теле) и проверена
 *    `ensureStudioRole`, а не «первая по createdAt» студия пользователя;
 *  - исключённому мастеру уходит уведомление (решение владельца), но не
 *    владельцу, исключившему самого себя (решение владельца 4.2 — можно).
 *
 * @probe 2026-09-29 — в роуте вместо `studio.providerId` выбранной студии
 * передан первый попавшийся (`"other-studio-prov"`): покраснел «переносит из
 * ВЫБРАННОЙ студии». Возвращено — зелёный.
 * @probe 2026-09-29 — условие `masterUserId !== auth.user.id` снято: покраснел
 * «владелец исключил себя — уведомления себе нет». Возвращено — зелёный.
 */

const ensureStudioRole = vi.hoisted(() => vi.fn());
const transferMasterOutOfStudio = vi.hoisted(() => vi.fn());
const notifyStudioMemberRemoved = vi.hoisted(() => vi.fn());
const studioFindUnique = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ userId: "admin-1" }));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(async () => ({ ok: true, user: { id: auth.userId } })),
}));
vi.mock("@/lib/studio/access", () => ({ ensureStudioRole }));
vi.mock("@/lib/studio/transfer-master", () => ({ transferMasterOutOfStudio }));
vi.mock("@/lib/notifications/studio-notifications", () => ({
  loadInviteWithRelations: vi.fn(),
  notifyStudioInviteRevoked: vi.fn(),
  notifyStudioMemberRemoved,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    provider: { findUnique: providerFindUnique },
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { POST } from "./route";

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/cabinet/studio/members/m-studio-prof/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ memberId: "m-studio-prof" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.userId = "admin-1";
  ensureStudioRole.mockResolvedValue(undefined);
  studioFindUnique.mockResolvedValue({ providerId: "vision-prov", provider: { name: "Студия Ольги" } });
  providerFindUnique.mockResolvedValue({ ownerUserId: "master-user" });
  transferMasterOutOfStudio.mockResolvedValue({ transferredServices: 2, revokedInviteIds: [] });
});

describe("POST /api/cabinet/studio/members/[memberId]/remove", () => {
  it("чужая студия — 403, ничего не переносится", async () => {
    ensureStudioRole.mockRejectedValue(new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"));
    const res = await call({ studioId: "foreign-studio" });
    expect(res.status).toBe(403);
    expect(transferMasterOutOfStudio).not.toHaveBeenCalled();
  });

  it("переносит из ВЫБРАННОЙ студии и уведомляет мастера", async () => {
    const res = await call({ studioId: "studio-1", transferServices: false });
    expect(res.status).toBe(200);
    expect(ensureStudioRole).toHaveBeenCalledWith(
      expect.objectContaining({ studioId: "studio-1", userId: "admin-1" }),
    );
    expect(transferMasterOutOfStudio).toHaveBeenCalledWith("m-studio-prof", "vision-prov", false, "STUDIO");
    expect(notifyStudioMemberRemoved).toHaveBeenCalledWith({
      masterUserId: "master-user",
      studioName: "Студия Ольги",
    });
  });

  it("владелец исключил себя — можно, уведомления себе нет", async () => {
    auth.userId = "master-user";
    const res = await call({ studioId: "studio-1" });
    expect(res.status).toBe(200);
    expect(transferMasterOutOfStudio).toHaveBeenCalled();
    expect(notifyStudioMemberRemoved).not.toHaveBeenCalled();
  });

  it("живые записи студии — действенный 409 дословно", async () => {
    transferMasterOutOfStudio.mockRejectedValue(
      new AppError("У мастера есть будущие записи в студии (3). Перенесите их…", 409, "MASTER_HAS_STUDIO_BOOKINGS", {
        count: 3,
      }),
    );
    const res = await call({ studioId: "studio-1" });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("MASTER_HAS_STUDIO_BOOKINGS");
    expect(json.error.message).toContain("(3)");
    expect(notifyStudioMemberRemoved).not.toHaveBeenCalled();
  });

  it("без studioId — 400", async () => {
    const res = await call({});
    expect(res.status).toBe(400);
  });
});
