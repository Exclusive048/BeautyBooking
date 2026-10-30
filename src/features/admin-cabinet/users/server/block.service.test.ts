import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Prisma } from "@prisma/client";

/**
 * USER-BLOCKING-01 — `blockUser` / `unblockUser`.
 *
 * Модель БД ниже — транзакционная: `$transaction` работает на КОПИИ состояния
 * и подменяет им состояние только при успехе, а при исключении копию
 * выбрасывает. Поэтому «аудит в той же транзакции» проверяется поведением:
 * упавшая запись аудита откатывает блокировку целиком, а запись аудита
 * пуловым клиентом мимо транзакции видна отдельно (`poolAudit`).
 *
 * @probe 2026-10-30 — у `createAdminAuditLog` в `blockUser` убран `tx`:
 *        красные «блокировка: одна транзакция…» (строка аудита ушла пуловым
 *        клиентом), «упавший аудит откатывает…» (запись мимо транзакции
 *        блокировку не откатывает — она закоммичена), «нет пользователя…» и
 *        «разблокировка: снимает…» (в них считаются строки аудита
 *        транзакции). Снято условие `emailVerifiedAt`
 *        в `isBootstrapAdmin` — красный «постоянный админ с НЕподтверждённым
 *        адресом…». Выключен отказ по числу оставшихся администраторов —
 *        красный «последнего администратора…». Убран `assertMayManage` из
 *        `unblockUser` — красный «разблокировать администратора…». Возвращено —
 *        зелёные.
 */

type User = {
  id: string;
  roles: AccountType[];
  email: string | null;
  emailVerifiedAt: Date | null;
  isDeleted: boolean;
  blockedAt: Date | null;
  blockedByUserId: string | null;
  blockedReason: string | null;
};
type State = {
  users: Record<string, User>;
  sessions: { id: string; userId: string; revokedAt: Date | null }[];
  mobilePush: { userId: string }[];
  webPush: { userId: string }[];
  audit: Record<string, unknown>[];
};

const harness = vi.hoisted(() => ({
  state: null as unknown as State,
  poolAudit: [] as Record<string, unknown>[],
  txOptions: [] as unknown[],
  failAudit: false,
  failCommitWith: null as unknown,
}));

function makeClient(s: State) {
  return {
    userProfile: {
      // Свежая копия строки, как у Prisma: последующий `update` её не меняет.
      findUnique: async ({ where }: { where: { id: string } }) =>
        s.users[where.id] ? { ...s.users[where.id]! } : null,
      count: async ({ where }: { where: { id: { not: string } } }) =>
        Object.values(s.users).filter(
          (u) =>
            u.id !== where.id.not &&
            !u.isDeleted &&
            u.blockedAt === null &&
            u.roles.some((r) => r === AccountType.ADMIN || r === AccountType.SUPERADMIN),
        ).length,
      update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        Object.assign(s.users[where.id]!, data);
        return s.users[where.id];
      },
    },
    refreshSession: {
      updateMany: async ({ where, data }: { where: { userId: string }; data: { revokedAt: Date } }) => {
        const rows = s.sessions.filter((row) => row.userId === where.userId && row.revokedAt === null);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    mobilePushDevice: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = s.mobilePush.length;
        s.mobilePush = s.mobilePush.filter((row) => row.userId !== where.userId);
        return { count: before - s.mobilePush.length };
      },
    },
    pushSubscription: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = s.webPush.length;
        s.webPush = s.webPush.filter((row) => row.userId !== where.userId);
        return { count: before - s.webPush.length };
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (harness.failAudit) throw new Error("audit write failed");
        s.audit.push(data);
        return data;
      },
    },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        harness.poolAudit.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      harness.txOptions.push(options);
      const draft = structuredClone(harness.state);
      const result = await fn(makeClient(draft));
      if (harness.failCommitWith) throw harness.failCommitWith;
      harness.state = draft;
      return result;
    },
  },
}));
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache: vi.fn(async () => undefined) }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { BOOTSTRAP_ADMIN_EMAILS } from "@/lib/auth/bootstrap-admins";
import { blockUser, unblockUser } from "@/features/admin-cabinet/users/server/block.service";

const ADMIN = { id: "admin-1", roles: [AccountType.CLIENT, AccountType.ADMIN] };
const SUPER = { id: "super-1", roles: [AccountType.CLIENT, AccountType.SUPERADMIN] };

function user(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    roles: [AccountType.CLIENT],
    email: null,
    emailVerifiedAt: null,
    isDeleted: false,
    blockedAt: null,
    blockedByUserId: null,
    blockedReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  harness.state = {
    users: {
      "admin-1": user("admin-1", { roles: ADMIN.roles }),
      "super-1": user("super-1", { roles: SUPER.roles }),
      client: user("client"),
    },
    sessions: [
      { id: "s1", userId: "client", revokedAt: null },
      { id: "s2", userId: "client", revokedAt: null },
      { id: "s3", userId: "admin-1", revokedAt: null },
    ],
    mobilePush: [{ userId: "client" }, { userId: "admin-1" }],
    webPush: [{ userId: "client" }],
    audit: [],
  };
  harness.poolAudit = [];
  harness.txOptions = [];
  harness.failAudit = false;
  harness.failCommitWith = null;
});

function block(actor: { id: string; roles: AccountType[] }, targetUserId: string, reason = "Спам в переписке") {
  return blockUser({ actor, targetUserId, reason });
}

describe("блокировка", () => {
  it("блокировка: одна транзакция — отметка, отзыв сессий, push и аудит", async () => {
    const state = await block(ADMIN, "client");

    expect(state).toMatchObject({ userId: "client", blockedReason: "Спам в переписке" });
    const target = harness.state.users.client!;
    expect(target.blockedAt).toBeInstanceOf(Date);
    expect(target.blockedByUserId).toBe("admin-1");
    expect(harness.state.sessions.filter((s) => s.userId === "client").every((s) => s.revokedAt)).toBe(true);
    expect(harness.state.sessions.find((s) => s.id === "s3")?.revokedAt).toBeNull();
    expect(harness.state.mobilePush).toEqual([{ userId: "admin-1" }]);
    expect(harness.state.webPush).toEqual([]);
    expect(harness.state.audit).toEqual([
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "USER_BLOCKED",
        targetType: "user",
        targetId: "client",
        reason: "Спам в переписке",
        details: { revokedSessions: 2, pushDevicesRemoved: 1, webPushSubscriptionsRemoved: 1 },
      }),
    ]);
    expect(harness.poolAudit).toEqual([]);
    expect(harness.txOptions).toEqual([{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }]);
  });

  it("упавший аудит откатывает блокировку целиком", async () => {
    harness.failAudit = true;
    await expect(block(ADMIN, "client")).rejects.toThrow("audit write failed");
    expect(harness.state.users.client!.blockedAt).toBeNull();
    expect(harness.state.sessions.every((s) => s.revokedAt === null)).toBe(true);
    expect(harness.state.mobilePush).toHaveLength(2);
    expect(harness.poolAudit).toEqual([]);
  });

  it("себя — 403, без транзакции", async () => {
    await expect(block(ADMIN, "admin-1")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(harness.txOptions).toEqual([]);
  });

  it("пустая причина — 400", async () => {
    await expect(block(ADMIN, "client", "   ")).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("нет пользователя или он удалён — 404; уже заблокирован — 409", async () => {
    harness.state.users.gone = user("gone", { isDeleted: true });
    await expect(block(ADMIN, "missing")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(block(ADMIN, "gone")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await block(ADMIN, "client");
    await expect(block(ADMIN, "client")).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(harness.state.audit).toHaveLength(1);
  });

  it("постоянный админ с подтверждённым адресом — 403 даже суперадминистратору", async () => {
    const email = BOOTSTRAP_ADMIN_EMAILS[0]!;
    harness.state.users.boot = user("boot", {
      roles: [AccountType.ADMIN],
      email: email.toUpperCase(),
      emailVerifiedAt: new Date("2026-09-23T00:00:00Z"),
    });
    await expect(block(SUPER, "boot")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(harness.state.users.boot!.blockedAt).toBeNull();
  });

  it("постоянный админ с НЕподтверждённым адресом — обычный аккаунт (адрес вписать может кто угодно)", async () => {
    harness.state.users.squatter = user("squatter", { email: BOOTSTRAP_ADMIN_EMAILS[0]!, emailVerifiedAt: null });
    await block(ADMIN, "squatter");
    expect(harness.state.users.squatter!.blockedAt).toBeInstanceOf(Date);
  });

  it("администратора блокирует только суперадминистратор", async () => {
    harness.state.users["admin-2"] = user("admin-2", { roles: [AccountType.ADMIN] });
    await expect(block(ADMIN, "admin-2")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(block(ADMIN, "super-1")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await block(SUPER, "admin-2");
    expect(harness.state.users["admin-2"]!.blockedAt).toBeInstanceOf(Date);
  });

  it("последнего администратора — 409", async () => {
    // Действующих администраторов, кроме цели, нет: вызывающий суперадмин
    // удалён (сессия ещё жива) — платформа осталась бы без администраторов.
    harness.state.users["super-1"]!.isDeleted = true;
    await expect(block(SUPER, "admin-1")).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(harness.state.users["admin-1"]!.blockedAt).toBeNull();
  });

  it("гонка сериализации (P2034) — 409, а не 500", async () => {
    harness.failCommitWith = new Prisma.PrismaClientKnownRequestError("serialization", {
      code: "P2034",
      clientVersion: "6",
    });
    await expect(block(ADMIN, "client")).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(harness.state.users.client!.blockedAt).toBeNull();
  });
});

describe("разблокировка", () => {
  it("снимает отметку и пишет прежнюю причину в аудит той же транзакцией", async () => {
    await block(ADMIN, "client");
    const blockedAt = harness.state.users.client!.blockedAt!;

    const state = await unblockUser({ actor: ADMIN, targetUserId: "client", reason: null });

    expect(state).toEqual({ userId: "client", blockedAt: null, blockedReason: null });
    expect(harness.state.users.client).toMatchObject({ blockedAt: null, blockedByUserId: null, blockedReason: null });
    expect(harness.state.audit.at(-1)).toMatchObject({
      action: "USER_UNBLOCKED",
      targetId: "client",
      reason: null,
      details: { blockedAt: blockedAt.toISOString(), blockedReason: "Спам в переписке" },
    });
    expect(harness.poolAudit).toEqual([]);
  });

  it("не заблокирован — 409", async () => {
    await expect(unblockUser({ actor: ADMIN, targetUserId: "client" })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("разблокировать администратора может только суперадминистратор", async () => {
    harness.state.users["admin-2"] = user("admin-2", { roles: [AccountType.ADMIN], blockedAt: new Date() });
    await expect(unblockUser({ actor: ADMIN, targetUserId: "admin-2" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    await unblockUser({ actor: SUPER, targetUserId: "admin-2" });
    expect(harness.state.users["admin-2"]!.blockedAt).toBeNull();
  });
});
