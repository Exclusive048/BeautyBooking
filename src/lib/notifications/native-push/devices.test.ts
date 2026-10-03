import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B2 — строки `MobilePushDevice`: одна на установку, перенос между
 * аккаунтами, один токен — одна установка, отвязка по семьям сессии и
 * страховка «мёртвая семья не получает push».
 *
 * `prisma` — память с разбором ровно тех условий, что пишет `devices.ts`.
 */

type Device = {
  id: string;
  installationId: string;
  userId: string;
  sessionFamilyId: string;
  provider: "FCM" | "APNS" | "RUSTORE";
  token: string;
  apnsEnvironment: "SANDBOX" | "PRODUCTION" | null;
  platform: string | null;
  appVersion: string | null;
};
type Session = { userId: string; familyId: string; revokedAt: Date | null; expiresAt: Date };

const db = vi.hoisted(() => ({ devices: [] as Device[], sessions: [] as Session[], seq: 0 }));

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Where[]).some((sub) => matches(row, sub));
    if (key === "NOT") return !matches(row, condition as Where);
    const actual = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; gt?: Date };
      if (ops.in) return ops.in.includes(actual);
      if (ops.gt) return actual instanceof Date && actual > ops.gt;
      throw new Error(`unsupported ${JSON.stringify(condition)}`);
    }
    return actual === condition;
  });
}

vi.mock("@/lib/prisma", () => {
  const mobilePushDevice = {
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const before = db.devices.length;
      db.devices = db.devices.filter((device) => !matches(device, where));
      return { count: before - db.devices.length };
    }),
    upsert: vi.fn(
      async ({ where, create, update }: { where: { installationId: string }; create: Omit<Device, "id">; update: Partial<Device> }) => {
        const existing = db.devices.find((device) => device.installationId === where.installationId);
        const next = existing ? { ...existing, ...update } : { id: `d${++db.seq}`, ...create };
        if (db.devices.some((d) => d !== existing && d.provider === next.provider && d.token === next.token)) {
          throw new Error("unique (provider, token) violated");
        }
        if (existing) Object.assign(existing, update);
        else db.devices.push(next as Device);
        return next;
      },
    ),
    findFirst: vi.fn(async ({ where }: { where: Where }) => db.devices.find((device) => matches(device, where)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Where }) => db.devices.filter((device) => matches(device, where)).map((d) => ({ ...d }))),
  };
  const refreshSession = {
    findMany: vi.fn(async ({ where }: { where: Where }) => db.sessions.filter((s) => matches(s, where))),
  };
  const prisma = {
    mobilePushDevice,
    refreshSession,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ mobilePushDevice, refreshSession })),
  };
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import {
  deleteInvalidPushDevices,
  hasPushDevices,
  loadDeliverableDevices,
  registerPushDevice,
  unlinkAllPushDevices,
  unlinkPushDevicesExceptFamily,
  unlinkPushDevicesOfFamilies,
  unregisterPushDevice,
} from "@/lib/notifications/native-push/devices";

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 1000);

const base = {
  userId: "u1",
  sessionFamilyId: "fam-1",
  installationId: "inst-aaaaaaaa",
  provider: "FCM" as const,
  token: "token-1",
  apnsEnvironment: null,
  platform: "android",
  appVersion: "1.0.0",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.devices = [];
  db.sessions = [];
  db.seq = 0;
});

describe("registerPushDevice", () => {
  it("первая регистрация — строка установки", async () => {
    await registerPushDevice(base);
    expect(db.devices).toEqual([expect.objectContaining({ installationId: "inst-aaaaaaaa", userId: "u1", token: "token-1" })]);
  });

  it("повтор той же установки — upsert: новый токен и версия, строка одна", async () => {
    await registerPushDevice(base);
    await registerPushDevice({ ...base, token: "token-2", appVersion: "1.0.1" });
    expect(db.devices).toHaveLength(1);
    expect(db.devices[0]).toMatchObject({ token: "token-2", appVersion: "1.0.1" });
  });

  it("вход другим аккаунтом на том же телефоне — строка переезжает к новому владельцу", async () => {
    await registerPushDevice(base);
    await registerPushDevice({ ...base, userId: "u2", sessionFamilyId: "fam-9" });
    expect(db.devices).toHaveLength(1);
    expect(db.devices[0]).toMatchObject({ userId: "u2", sessionFamilyId: "fam-9" });
    expect(await hasPushDevices("u1")).toBe(false);
  });

  it("тот же токен у другой установки (переустановка) — удаляется там", async () => {
    await registerPushDevice(base);
    await registerPushDevice({ ...base, installationId: "inst-bbbbbbbb" });
    expect(db.devices.map((d) => d.installationId)).toEqual(["inst-bbbbbbbb"]);
  });

  it("тот же токен у другого провайдера — разные строки (уникальность по паре)", async () => {
    await registerPushDevice(base);
    await registerPushDevice({ ...base, installationId: "inst-bbbbbbbb", provider: "RUSTORE" });
    expect(db.devices).toHaveLength(2);
  });

  it("окружение APNs хранится только у APNS", async () => {
    await registerPushDevice({ ...base, apnsEnvironment: "SANDBOX" });
    expect(db.devices[0]!.apnsEnvironment).toBeNull();
    await registerPushDevice({ ...base, installationId: "inst-ios-0001", provider: "APNS", token: "ab".repeat(32), apnsEnvironment: "SANDBOX" });
    expect(db.devices[1]!.apnsEnvironment).toBe("SANDBOX");
  });
});

describe("unregisterPushDevice", () => {
  it("только своя установка; повтор идемпотентен", async () => {
    await registerPushDevice(base);
    await unregisterPushDevice("u2", "inst-aaaaaaaa");
    expect(db.devices).toHaveLength(1);
    await unregisterPushDevice("u1", "inst-aaaaaaaa");
    await unregisterPushDevice("u1", "inst-aaaaaaaa");
    expect(db.devices).toHaveLength(0);
  });
});

describe("отвязка при отзыве сессий", () => {
  beforeEach(async () => {
    await registerPushDevice({ ...base, installationId: "inst-1-aaaa", token: "t1", sessionFamilyId: "fam-1" });
    await registerPushDevice({ ...base, installationId: "inst-2-aaaa", token: "t2", sessionFamilyId: "fam-2" });
    await registerPushDevice({ ...base, installationId: "inst-3-aaaa", token: "t3", sessionFamilyId: "fam-3", userId: "u2" });
  });
  const ids = () => db.devices.map((d) => d.installationId).sort();

  it("семьи — только их установки этого пользователя", async () => {
    expect(await unlinkPushDevicesOfFamilies(prisma, "u1", ["fam-1", "fam-3"])).toBe(1);
    expect(ids()).toEqual(["inst-2-aaaa", "inst-3-aaaa"]);
    expect(await unlinkPushDevicesOfFamilies(prisma, "u1", [])).toBe(0);
  });

  it("все, кроме текущей; без текущей — все свои", async () => {
    await unlinkPushDevicesExceptFamily(prisma, "u1", "fam-2");
    expect(ids()).toEqual(["inst-2-aaaa", "inst-3-aaaa"]);
    await unlinkPushDevicesExceptFamily(prisma, "u1", null);
    expect(ids()).toEqual(["inst-3-aaaa"]);
  });

  it("все устройства пользователя", async () => {
    await unlinkAllPushDevices(prisma, "u1");
    expect(ids()).toEqual(["inst-3-aaaa"]);
  });
});

describe("loadDeliverableDevices — страховка «мёртвая семья не получает push»", () => {
  it("живые семьи — отдаются; отозванные и истёкшие — удаляются", async () => {
    await registerPushDevice({ ...base, installationId: "inst-live-01", token: "t-live", sessionFamilyId: "fam-live" });
    await registerPushDevice({ ...base, installationId: "inst-rev-001", token: "t-rev", sessionFamilyId: "fam-revoked" });
    await registerPushDevice({ ...base, installationId: "inst-exp-001", token: "t-exp", sessionFamilyId: "fam-expired" });
    db.sessions = [
      { userId: "u1", familyId: "fam-live", revokedAt: null, expiresAt: FUTURE },
      { userId: "u1", familyId: "fam-revoked", revokedAt: PAST, expiresAt: FUTURE },
      { userId: "u1", familyId: "fam-expired", revokedAt: null, expiresAt: PAST },
    ];

    const devices = await loadDeliverableDevices("u1");
    expect(devices.map((d) => d.token)).toEqual(["t-live"]);
    expect(db.devices.map((d) => d.installationId)).toEqual(["inst-live-01"]);
    // Наружу — только то, что нужно отправке (без семьи и установки).
    expect(Object.keys(devices[0]!).sort()).toEqual(["apnsEnvironment", "id", "provider", "token"]);
  });

  it("повтор — только перечисленные устройства", async () => {
    await registerPushDevice({ ...base, installationId: "inst-a-0001", token: "ta" });
    await registerPushDevice({ ...base, installationId: "inst-b-0001", token: "tb" });
    db.sessions = [{ userId: "u1", familyId: "fam-1", revokedAt: null, expiresAt: FUTURE }];
    const second = db.devices[1]!.id;
    expect((await loadDeliverableDevices("u1", [second])).map((d) => d.token)).toEqual(["tb"]);
  });
});

describe("deleteInvalidPushDevices", () => {
  it("удаляет по id И токену: установку, приславшую новый токен, не трогает", async () => {
    await registerPushDevice(base);
    const { id } = db.devices[0]!;
    await registerPushDevice({ ...base, token: "token-new" });
    expect(await deleteInvalidPushDevices([{ id, token: "token-1" }])).toBe(0);
    expect(db.devices).toHaveLength(1);
    expect(await deleteInvalidPushDevices([{ id, token: "token-new" }])).toBe(1);
    expect(await deleteInvalidPushDevices([])).toBe(0);
  });
});
