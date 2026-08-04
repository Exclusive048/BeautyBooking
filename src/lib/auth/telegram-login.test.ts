import { describe, it, expect, beforeEach, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * AUTH-PROVIDER-ABSTRACTION-00 — CHARACTERIZATION (pins CURRENT behavior).
 *
 * `authenticateTelegramLogin` is the ONE OAuth-ish provider whose new-vs-existing
 * user resolution is EXTRACTED into a testable function (VK/Yandex keep theirs
 * inline in the callback route — see the Phase-0 report; those need a Phase-1
 * extraction before they can be characterized). This pins: invalid-hash reject,
 * stale-auth_date reject, new-user create ([CLIENT]), existing-user field
 * backfill + CLIENT-role ensure. Must stay green, unchanged, across any refactor.
 *
 * `verifyTelegramLogin` (the HMAC primitive) is mocked here so validity is
 * controlled directly — its own crypto round-trip is characterized in telegram.test.ts.
 */

const userFindUnique = vi.hoisted(() => vi.fn());
const userCreate = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());
const verifyMock = vi.hoisted(() => vi.fn());
const ensureClientRole = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
  },
}));
vi.mock("@/lib/auth/telegram", () => ({ verifyTelegramLogin: verifyMock }));
vi.mock("@/lib/auth/roles", () => ({ ensureClientRoleForUser: ensureClientRole }));

import { authenticateTelegramLogin } from "@/lib/auth/telegram-login";

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    first_name: "Елена",
    last_name: "Петрова",
    username: "elena",
    photo_url: "https://t.me/i/elena.jpg",
    auth_date: NOW_SECONDS(),
    hash: "sig",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("authenticateTelegramLogin — new-vs-existing + guards (characterization)", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    userCreate.mockReset();
    userUpdate.mockReset();
    verifyMock.mockReset();
    ensureClientRole.mockReset();
    ensureClientRole.mockImplementation((_id: string, roles: AccountType[]) => roles);
  });

  it("rejects an invalid Telegram hash → 401 INVALID_HASH (no DB touch)", async () => {
    verifyMock.mockReturnValue(false);
    const result = await authenticateTelegramLogin(makePayload(), "token");
    // ERR-LOCALIZATION-01: предмет теста — решение (401 + код), а не текст.
    // `toMatchObject` вместо `toEqual` c `message` — как в соседнем тесте
    // «future-skewed auth_date», который и раньше проверял только код.
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "INVALID_HASH",
    });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a stale auth_date → 401 AUTH_DATE_EXPIRED", async () => {
    verifyMock.mockReturnValue(true);
    const stale = NOW_SECONDS() - 3601; // just past the 1h freshness window
    const result = await authenticateTelegramLogin(makePayload({ auth_date: stale }), "token");
    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "AUTH_DATE_EXPIRED",
    });
  });

  it("rejects a future-skewed auth_date beyond +60s → 401 AUTH_DATE_EXPIRED", async () => {
    verifyMock.mockReturnValue(true);
    const future = NOW_SECONDS() + 120;
    const result = await authenticateTelegramLogin(makePayload({ auth_date: future }), "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AUTH_DATE_EXPIRED");
  });

  it("new user: creates a [CLIENT] profile bound to telegramId", async () => {
    verifyMock.mockReturnValue(true);
    userFindUnique.mockResolvedValueOnce(null);
    const created = { id: "u-new", roles: [AccountType.CLIENT], telegramId: "42" };
    userCreate.mockResolvedValueOnce(created);

    const result = await authenticateTelegramLogin(makePayload(), "token");

    expect(result).toEqual({ ok: true, user: created });
    expect(userCreate).toHaveBeenCalledOnce();
    const createArg = userCreate.mock.calls[0][0].data;
    expect(createArg.telegramId).toBe("42");
    expect(createArg.roles).toEqual([AccountType.CLIENT]);
    expect(createArg.displayName).toBe("Елена Петрова");
    // Existing-user path (role ensure) not taken for a fresh create.
    expect(ensureClientRole).not.toHaveBeenCalled();
  });

  it("existing user: backfills only-empty fields + ensures CLIENT role", async () => {
    verifyMock.mockReturnValue(true);
    const existing = {
      id: "u-existing",
      roles: [AccountType.MASTER],
      telegramId: "42",
      firstName: null, // empty → backfilled
      lastName: "Петрова", // present → NOT overwritten
      displayName: null, // empty → backfilled
      telegramUsername: "old", // differs → refreshed
      externalPhotoUrl: "https://t.me/i/elena.jpg", // same → not written
    };
    userFindUnique.mockResolvedValueOnce(existing);
    userUpdate.mockImplementationOnce(({ data }) => Promise.resolve({ ...existing, ...data }));
    const withClient = [AccountType.MASTER, AccountType.CLIENT];
    ensureClientRole.mockResolvedValueOnce(withClient);

    const result = await authenticateTelegramLogin(makePayload(), "token");

    expect(result.ok).toBe(true);
    expect(userCreate).not.toHaveBeenCalled();
    const updateData = userUpdate.mock.calls[0][0].data;
    expect(updateData.firstName).toBe("Елена"); // backfilled (was null)
    expect(updateData.lastName).toBeUndefined(); // preserved (was present)
    expect(updateData.displayName).toBe("Елена Петрова"); // backfilled
    expect(updateData.telegramUsername).toBe("elena"); // refreshed (differed)
    expect(updateData.externalPhotoUrl).toBeUndefined(); // unchanged (same)
    expect(ensureClientRole).toHaveBeenCalledWith("u-existing", [AccountType.MASTER]);
    if (result.ok) expect(result.user.roles).toEqual(withClient);
  });
});
