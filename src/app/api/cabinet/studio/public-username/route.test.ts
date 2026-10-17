import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRole } from "@prisma/client";

/**
 * Адрес страницы студии (`/api/cabinet/studio/public-username`) — студия из
 * сессии та же, что у кабинета (`resolveCurrentStudioAccess`), править может
 * владелец и администратор, мастеру студии — 403.
 *
 * @probe 2026-10-16 — возврат поиска `{ type: STUDIO, ownerUserId }`: кейсы
 * администратора краснеют (404 `PROVIDER_NOT_FOUND` вместо адреса студии).
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn());
const aliasFindUnique = vi.hoisted(() => vi.fn());
const aliasCreate = vi.hoisted(() => vi.fn());
const aliasFindMany = vi.hoisted(() => vi.fn());
const aliasDeleteMany = vi.hoisted(() => vi.fn());
const isUsernameTaken = vi.hoisted(() => vi.fn());
const ensureUniqueUsername = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findFirst: providerFindFirst, findUnique: providerFindUnique, update: providerUpdate },
    publicUsernameAlias: {
      findUnique: aliasFindUnique,
      create: aliasCreate,
      findMany: aliasFindMany,
      deleteMany: aliasDeleteMany,
    },
  },
}));
vi.mock("@/lib/publicUsername", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicUsername")>()),
  isUsernameTaken,
  ensureUniqueUsername,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));

import { GET, POST } from "./route";

type Body = { ok: boolean; data?: { username: string; url: string }; error?: { code: string; message: string } };

const URL = "http://localhost/api/cabinet/studio/public-username";
const read = async (res: Response) => (await res.json()) as Body;

/** Строка студии находится только по её id — как в базе, где администратор не владелец. */
function studioRow(row: { id: string; name: string; publicUsername: string | null }) {
  providerFindFirst.mockImplementation(async (args: { where?: { id?: string } }) =>
    args.where?.id === row.id ? row : null,
  );
}

function asRole(role: StudioRole) {
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [role],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-admin", roles: ["CLIENT"] });
  asRole(StudioRole.ADMIN);
  providerFindUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
    args.select && "timezone" in args.select
      ? { timezone: "Asia/Yekaterinburg" }
      : { publicUsername: "lak" },
  );
  studioRow({ id: "provider-s1", name: "Лак", publicUsername: "lak" });
  providerUpdate.mockResolvedValue({ id: "provider-s1", publicUsername: "lak-studio" });
  aliasFindUnique.mockResolvedValue(null);
  aliasCreate.mockResolvedValue({ id: "alias-1" });
  aliasFindMany.mockResolvedValue([{ id: "alias-1" }]);
  isUsernameTaken.mockResolvedValue(false);
  ensureUniqueUsername.mockResolvedValue("lak");
});

describe("GET /api/cabinet/studio/public-username", () => {
  it("отдаёт администратору адрес студии из кабинета, а не ищет студию во владении", async () => {
    const res = await GET(new Request(URL));
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ username: "lak", url: "https://masterryadom.ru/u/lak" });
    expect(providerFindFirst.mock.calls[0]?.[0]?.where).not.toHaveProperty("ownerUserId");
  });

  it("выдаёт адрес при первом заходе администратора", async () => {
    studioRow({ id: "provider-s1", name: "Лак", publicUsername: null });

    const res = await GET(new Request(URL));

    expect(res.status).toBe(200);
    expect(providerUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "provider-s1" } }));
  });

  it("мастеру студии — 403", async () => {
    asRole(StudioRole.MASTER);

    const res = await GET(new Request(URL));
    const body = await read(res);

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
    expect(providerFindFirst).not.toHaveBeenCalled();
  });

  it("без входа — 401", async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await GET(new Request(URL))).status).toBe(401);
  });
});

describe("POST /api/cabinet/studio/public-username", () => {
  const rename = (username: string) =>
    POST(
      new Request(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      }),
    );

  it("администратор меняет адрес студии; старый остаётся переадресацией", async () => {
    const res = await rename("lak-studio");
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(body.data?.username).toBe("lak-studio");
    expect(aliasCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { username: "lak", providerId: "provider-s1" } }),
    );
    expect(providerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "provider-s1" }, data: expect.objectContaining({ publicUsername: "lak-studio" }) }),
    );
  });

  it("мастеру студии — 403, адрес не меняется", async () => {
    asRole(StudioRole.MASTER);

    const res = await rename("lak-studio");

    expect(res.status).toBe(403);
    expect(providerUpdate).not.toHaveBeenCalled();
  });
});
