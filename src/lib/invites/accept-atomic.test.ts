import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * INVITE-ACCEPT-ATOMIC (находка B-05, 2026-10-30) — гонки принятия приглашения
 * в студию.
 *
 * Было: шаги шли отдельными запросами, статус приглашения менялся безусловно в
 * конце. Два нажатия «Принять» давали два профиля в студии; приглашения двух
 * студий, принятые одновременно, — профили в обеих; при одном свободном месте
 * его занимали оба.
 *
 * Как устроен стенд. Базы в тестах нет, поэтому Prisma заменена маленькой
 * моделью Postgres ровно в тех свойствах, на которых держится защита:
 * - транзакция пишет в свой слой и не видит чужих незакоммиченных записей
 *   (READ COMMITTED: каждое чтение — последнее закоммиченное плюс своё);
 * - откат выбрасывает слой целиком;
 * - `pg_advisory_xact_lock` — мьютекс по ключу до конца транзакции;
 * - `updateMany` берёт блокировку строки до конца транзакции и после ожидания
 *   перепроверяет условие на свежей версии строки (как EvalPlanQual).
 * Чего модель НЕ знает: уникальных индексов, дедлоков, таймаутов, настоящего
 * планировщика. Это проверка устройства кода, а не доказательство на живой
 * базе; живой прогон двух параллельных принятий — в отчёте как невыполненный.
 *
 * @probe 2026-10-30 — снята `lockInviteAcceptorTx`: краснеет «две студии» (оба
 * приёма успешны, два профиля). Снята `lockStudioInvitesTx`: краснеет «одно
 * свободное место» (заняли оба). Условный `updateMany` приглашения заменён
 * безусловной записью: краснеет «одно приглашение дважды» (второй приём
 * переиспользовал профиль первого и тоже «успешен»). Возвращено — зелёный.
 */

const fake = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string };
  type Table = "studioInvite" | "provider" | "masterProfile" | "studioMembership";
  type Tables = Record<Table, Row[]>;
  type Where = Record<string, unknown>;

  class Mutex {
    private locked = false;
    private waiters: Array<() => void> = [];
    async acquire(): Promise<void> {
      if (!this.locked) {
        this.locked = true;
        return;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    release(): void {
      const next = this.waiters.shift();
      if (next) next();
      else this.locked = false;
    }
  }

  function matches(row: Row, where: Where): boolean {
    for (const [key, cond] of Object.entries(where)) {
      if (key === "userId_studioId") {
        const pair = cond as { userId: string; studioId: string };
        if (row.userId !== pair.userId || row.studioId !== pair.studioId) return false;
        continue;
      }
      const value = row[key] ?? null;
      if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
        const c = cond as Record<string, unknown>;
        if ("is" in c && value !== c.is) return false;
        if ("not" in c && value === c.not) return false;
        if ("notIn" in c && (c.notIn as unknown[]).includes(value)) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  const state = {
    committed: { studioInvite: [], provider: [], masterProfile: [], studioMembership: [] } as Tables,
    mutexes: new Map<string, Mutex>(),
    lockLog: [] as string[],
    seq: 0,
  };

  function mutex(key: string): Mutex {
    let found = state.mutexes.get(key);
    if (!found) {
      found = new Mutex();
      state.mutexes.set(key, found);
    }
    return found;
  }

  /** Транзакция: свой слой записей поверх закоммиченного + удерживаемые блокировки. */
  class Tx {
    /** `table:id` → новая версия строки; `row: null` — строка удалена. */
    readonly overlay = new Map<string, { table: Table; id: string; row: Row | null }>();
    private readonly held = new Set<string>();

    async lock(key: string): Promise<void> {
      if (this.held.has(key)) return;
      await mutex(key).acquire();
      this.held.add(key);
    }

    rows(table: Table): Row[] {
      const out = new Map<string, Row>();
      for (const row of state.committed[table]) out.set(row.id, row);
      for (const { table: t, id, row } of this.overlay.values()) {
        if (t !== table) continue;
        if (row) out.set(id, row);
        else out.delete(id);
      }
      return [...out.values()];
    }

    write(table: Table, row: Row): void {
      this.overlay.set(`${table}:${row.id}`, { table, id: row.id, row: { ...row } });
    }

    commit(): void {
      for (const { table, id, row } of this.overlay.values()) {
        const list = state.committed[table];
        const index = list.findIndex((r) => r.id === id);
        if (row && index >= 0) list[index] = row;
        else if (row) list.push(row);
        else if (index >= 0) list.splice(index, 1);
      }
    }

    release(): void {
      for (const key of this.held) mutex(key).release();
      this.held.clear();
    }
  }

  function delegate(tx: Tx, table: Table) {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    return {
      async findUnique({ where }: { where: Where }) {
        await tick();
        return tx.rows(table).find((row) => matches(row, where)) ?? null;
      },
      async findFirst({ where }: { where: Where }) {
        await tick();
        return tx.rows(table).find((row) => matches(row, where)) ?? null;
      },
      async findMany({ where }: { where: Where }) {
        await tick();
        return tx.rows(table).filter((row) => matches(row, where));
      },
      async count({ where }: { where: Where }) {
        await tick();
        return tx.rows(table).filter((row) => matches(row, where)).length;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await tick();
        const row = { id: `${table}-${++state.seq}`, ...data } as Row;
        tx.write(table, row);
        return row;
      },
      async update({ where, data }: { where: Where; data: Record<string, unknown> }) {
        await tick();
        const row = tx.rows(table).find((r) => matches(r, where));
        if (!row) throw new Error(`${table} not found`);
        await tx.lock(`row:${table}:${row.id}`);
        const fresh = tx.rows(table).find((r) => r.id === row.id)!;
        const next = { ...fresh, ...data } as Row;
        tx.write(table, next);
        return next;
      },
      async updateMany({ where, data }: { where: Where; data: Record<string, unknown> }) {
        await tick();
        let count = 0;
        for (const candidate of tx.rows(table).filter((r) => matches(r, where))) {
          await tx.lock(`row:${table}:${candidate.id}`);
          // после ожидания блокировки условие перепроверяется на свежей версии
          const fresh = tx.rows(table).find((r) => r.id === candidate.id);
          if (!fresh || !matches(fresh, where)) continue;
          tx.write(table, { ...fresh, ...data } as Row);
          count += 1;
        }
        return { count };
      },
      async deleteMany({ where }: { where: Where }) {
        await tick();
        let count = 0;
        for (const candidate of tx.rows(table).filter((r) => matches(r, where))) {
          await tx.lock(`row:${table}:${candidate.id}`);
          const fresh = tx.rows(table).find((r) => r.id === candidate.id);
          if (!fresh || !matches(fresh, where)) continue;
          tx.overlay.set(`${table}:${fresh.id}`, { table, id: fresh.id, row: null });
          count += 1;
        }
        return { count };
      },
    };
  }

  function client(tx: Tx) {
    return {
      async $executeRaw(_strings: TemplateStringsArray, key: string) {
        state.lockLog.push(key);
        await tx.lock(`advisory:${key}`);
        return 1;
      },
      studioInvite: delegate(tx, "studioInvite"),
      provider: delegate(tx, "provider"),
      masterProfile: delegate(tx, "masterProfile"),
      studioMembership: delegate(tx, "studioMembership"),
    };
  }

  async function transaction<T>(fn: (c: ReturnType<typeof client>) => Promise<T>): Promise<T> {
    const tx = new Tx();
    try {
      const result = await fn(client(tx));
      tx.commit();
      return result;
    } finally {
      tx.release();
    }
  }

  /** Запрос вне транзакции — автокоммит одной инструкции. */
  function autocommit(table: Table) {
    const run =
      <A, R>(method: (d: ReturnType<typeof delegate>, arg: A) => Promise<R>) =>
      (arg: A) =>
        transaction(async (c) => method(c[table], arg));
    return {
      findUnique: run((d, a: { where: Where }) => d.findUnique(a)),
      findFirst: run((d, a: { where: Where }) => d.findFirst(a)),
      findMany: run((d, a: { where: Where }) => d.findMany(a)),
      count: run((d, a: { where: Where }) => d.count(a)),
      update: run((d, a: { where: Where; data: Record<string, unknown> }) => d.update(a)),
      updateMany: run((d, a: { where: Where; data: Record<string, unknown> }) => d.updateMany(a)),
      deleteMany: run((d, a: { where: Where }) => d.deleteMany(a)),
    };
  }

  const prisma = {
    $transaction: transaction,
    studioInvite: autocommit("studioInvite"),
    provider: autocommit("provider"),
    masterProfile: autocommit("masterProfile"),
    studioMembership: autocommit("studioMembership"),
  };

  function reset(seed: Partial<Tables>) {
    state.committed = {
      studioInvite: [...(seed.studioInvite ?? [])],
      provider: [...(seed.provider ?? [])],
      masterProfile: [...(seed.masterProfile ?? [])],
      studioMembership: [...(seed.studioMembership ?? [])],
    };
    state.mutexes.clear();
    state.lockLog.length = 0;
    state.seq = 0;
  }

  return { prisma, state, reset };
});

const counters = vi.hoisted(() => ({ scheduleCopies: 0 }));

vi.mock("@/lib/prisma", () => ({ prisma: fake.prisma }));
vi.mock("@/lib/invites/access", () => ({
  resolveInviteAccess: vi.fn(async () => "PHONE_OWNER"),
  normalizeInviteEmail: (value: string | null) => value?.trim().toLowerCase() || null,
}));
vi.mock("@/lib/invites/master-readiness", () => ({
  resolveMasterInviteReadiness: vi.fn(async () => ({ hasCabinet: true, ready: true, doneCount: 7, total: 7, href: "/" })),
}));
vi.mock("@/lib/auth/roles", () => ({ addRoleToUser: vi.fn(async () => []) }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/media/purge", () => ({ collectProviderMedia: vi.fn(async () => []) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

/** Места команды — тем клиентом, который передан (в транзакции — её). */
vi.mock("@/lib/studio/team-limits", async () => {
  const { AppError } = await import("@/lib/api/errors");
  type Seat = { providerId: string; cap: number | null };
  type CountClient = { provider: { count: (a: { where: Record<string, unknown> }) => Promise<number> } };
  return {
    resolveStudioTeamSeat: async (studioId: string): Promise<Seat> => {
      const studio = fake.state.committed.provider.find((p) => p.studioRowId === studioId);
      return { providerId: studio!.id, cap: (studio!.teamCap as number | null) ?? null };
    },
    assertStudioTeamSeatAvailable: async (seat: Seat, db: CountClient = fake.prisma as unknown as CountClient) => {
      if (seat.cap === null) return;
      const active = await db.provider.count({
        where: { type: "MASTER", studioId: seat.providerId, ownerUserId: { not: null }, studioPaused: false },
      });
      if (active >= seat.cap) throw new AppError("Команда заполнена.", 409, "LIMIT_REACHED");
    },
  };
});

/** Захват заготовки и создание профиля — тем же условием, что настоящие. */
vi.mock("@/lib/studios/master-profile-split", () => {
  type Client = {
    provider: {
      updateMany: (a: unknown) => Promise<{ count: number }>;
      findUnique: (a: unknown) => Promise<{ ownerUserId: unknown } | null>;
      create: (a: unknown) => Promise<{ id: string }>;
    };
  };
  return {
    claimStagedStudioProfileTx: async (tx: Client, input: { stagedId: string; ownerUserId: string }) => {
      const claimed = await tx.provider.updateMany({
        where: { id: input.stagedId, ownerUserId: null },
        data: { ownerUserId: input.ownerUserId, studioPaused: false },
      });
      if (claimed.count === 0) return false;
      counters.scheduleCopies += 1;
      return true;
    },
    createStudioMasterProfileTx: async (tx: Client, input: { personalId: string; studioProviderId: string }) => {
      const personal = await tx.provider.findUnique({ where: { id: input.personalId } });
      counters.scheduleCopies += 1;
      const created = await tx.provider.create({
        data: {
          type: "MASTER",
          ownerUserId: personal?.ownerUserId,
          studioId: input.studioProviderId,
          studioPaused: false,
          masterProfile: null,
        },
      });
      return created.id;
    },
  };
});

vi.mock("@/lib/studios/masters", () => ({
  attachMasterToStudio: async (
    studioProviderId: string,
    masterProviderId: string,
    db: { provider: { updateMany: (a: unknown) => Promise<{ count: number }> } },
  ) => {
    await db.provider.updateMany({
      where: { id: masterProviderId, studioId: studioProviderId },
      data: { studioId: studioProviderId },
    });
    return { ok: true, data: { id: masterProviderId } };
  },
}));

import { acceptStudioInvite, rejectStudioInvite } from "@/lib/invites/service";

function user(id: string, phone: string) {
  return { id, phone, phoneVerifiedAt: new Date(), email: null, emailVerifiedAt: null, roles: ["MASTER" as const] };
}

/** Мастер с личным кабинетом (`MasterProfile`). */
function personal(userId: string) {
  return [
    { id: `personal-${userId}`, type: "MASTER", ownerUserId: userId, studioId: null, studioPaused: false, masterProfile: `mp-${userId}` },
  ];
}

function studio(n: number, teamCap: number | null = 20) {
  return { id: `studio-provider-${n}`, type: "STUDIO", studioRowId: `studio-${n}`, ownerUserId: `owner-${n}`, teamCap };
}

function invite(id: string, n: number, phone: string) {
  return { id, studioId: `studio-${n}`, phone, email: null, status: "PENDING", studio: { providerId: `studio-provider-${n}` } };
}

/** Профили в студиях: MASTER со `studioId` и без `MasterProfile`, с владельцем. */
function studioProfilesOf(userId: string) {
  return fake.state.committed.provider.filter(
    (p) => p.type === "MASTER" && p.ownerUserId === userId && p.studioId !== null && p.masterProfile === null,
  );
}

const ANNA = user("anna", "+79990000001");
const OLGA = user("olga", "+79990000002");

beforeEach(() => {
  counters.scheduleCopies = 0;
});

describe("acceptStudioInvite — гонки (INVITE-ACCEPT-ATOMIC)", () => {
  it("🔴 одно приглашение дважды (двойной клик, две вкладки) — один успех, один 409, один профиль", async () => {
    fake.reset({
      provider: [
        studio(1),
        ...personal("anna"),
        // заготовка студии под приглашение
        { id: "staged-1", type: "MASTER", ownerUserId: null, studioId: "studio-provider-1", contactPhone: ANNA.phone, studioPaused: false, masterProfile: null },
      ],
      masterProfile: [{ id: "mp-anna", userId: "anna", providerId: "personal-anna" }],
      studioInvite: [invite("inv-1", 1, ANNA.phone)],
    });

    const results = await Promise.all([acceptStudioInvite("inv-1", ANNA), acceptStudioInvite("inv-1", ANNA)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, code: "INVITE_ALREADY_ACCEPTED" });
    expect(studioProfilesOf("anna")).toHaveLength(1);
    expect(counters.scheduleCopies).toBe(1);
    expect(fake.state.committed.studioMembership).toHaveLength(1);
  });

  it("🔴 приглашения двух студий одновременно — вторая получает 409 MASTER_ALREADY_ASSIGNED", async () => {
    fake.reset({
      provider: [studio(1), studio(2), ...personal("anna")],
      masterProfile: [{ id: "mp-anna", userId: "anna", providerId: "personal-anna" }],
      studioInvite: [invite("inv-1", 1, ANNA.phone), invite("inv-2", 2, ANNA.phone)],
    });

    const results = await Promise.all([acceptStudioInvite("inv-1", ANNA), acceptStudioInvite("inv-2", ANNA)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, code: "MASTER_ALREADY_ASSIGNED" });
    expect(studioProfilesOf("anna")).toHaveLength(1);
    // проигравшая транзакция откатилась целиком: её приглашение снова ждёт ответа
    const statuses = fake.state.committed.studioInvite.map((i) => i.status).sort();
    expect(statuses).toEqual(["ACTIVE", "PENDING"]);
    expect(fake.state.committed.studioMembership).toHaveLength(1);
  });

  it("🔴 одно свободное место, два мастера — место получает один, второму LIMIT_REACHED", async () => {
    fake.reset({
      provider: [studio(1, 1), ...personal("anna"), ...personal("olga")],
      masterProfile: [
        { id: "mp-anna", userId: "anna", providerId: "personal-anna" },
        { id: "mp-olga", userId: "olga", providerId: "personal-olga" },
      ],
      studioInvite: [invite("inv-a", 1, ANNA.phone), invite("inv-o", 1, OLGA.phone)],
    });

    const results = await Promise.all([acceptStudioInvite("inv-a", ANNA), acceptStudioInvite("inv-o", OLGA)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ status: 409, code: "LIMIT_REACHED" });
    expect([...studioProfilesOf("anna"), ...studioProfilesOf("olga")]).toHaveLength(1);
  });

  it("блокировки берутся в одном порядке: человек, потом студия", async () => {
    fake.reset({
      provider: [studio(1), ...personal("anna")],
      masterProfile: [{ id: "mp-anna", userId: "anna", providerId: "personal-anna" }],
      studioInvite: [invite("inv-1", 1, ANNA.phone)],
    });

    await acceptStudioInvite("inv-1", ANNA);

    expect(fake.state.lockLog).toEqual(["invite-accept:anna", "studio-invites:studio-1"]);
  });

  it("принятие и отказ одновременно — побеждает одно, состояние согласовано", async () => {
    fake.reset({
      provider: [studio(1), ...personal("anna")],
      masterProfile: [{ id: "mp-anna", userId: "anna", providerId: "personal-anna" }],
      studioInvite: [invite("inv-1", 1, ANNA.phone)],
    });

    const [accepted, rejected] = await Promise.all([
      acceptStudioInvite("inv-1", ANNA),
      rejectStudioInvite("inv-1", ANNA),
    ]);

    const status = fake.state.committed.studioInvite[0].status;
    expect([accepted.ok, rejected.ok].filter(Boolean)).toHaveLength(1);
    if (accepted.ok) {
      expect(status).toBe("ACTIVE");
      expect(rejected).toMatchObject({ status: 409, code: "INVITE_ALREADY_ACCEPTED" });
      expect(studioProfilesOf("anna")).toHaveLength(1);
    } else {
      expect(status).toBe("REJECTED");
      expect(accepted).toMatchObject({ status: 409, code: "INVITE_ALREADY_REJECTED" });
      expect(studioProfilesOf("anna")).toHaveLength(0);
    }
  });
});

describe("rejectStudioInvite — условно, как принятие", () => {
  function seed() {
    fake.reset({
      provider: [
        studio(1),
        ...personal("anna"),
        { id: "staged-1", type: "MASTER", ownerUserId: null, studioId: "studio-provider-1", contactPhone: ANNA.phone, studioPaused: false, masterProfile: null },
      ],
      masterProfile: [{ id: "mp-anna", userId: "anna", providerId: "personal-anna" }],
      studioInvite: [invite("inv-1", 1, ANNA.phone)],
    });
  }

  it("🔴 отказ после принятия — 409, принятое не перезаписывается, профиль на месте", async () => {
    seed();
    await acceptStudioInvite("inv-1", ANNA);

    const rejected = await rejectStudioInvite("inv-1", ANNA);

    expect(rejected).toMatchObject({ ok: false, status: 409, code: "INVITE_ALREADY_ACCEPTED" });
    expect(fake.state.committed.studioInvite[0].status).toBe("ACTIVE");
    expect(studioProfilesOf("anna")).toHaveLength(1);
  });

  it("отказ убирает ничейную заготовку; повторный отказ — тоже успех", async () => {
    seed();

    await expect(rejectStudioInvite("inv-1", ANNA)).resolves.toMatchObject({ ok: true });
    await expect(rejectStudioInvite("inv-1", ANNA)).resolves.toMatchObject({ ok: true });

    expect(fake.state.committed.studioInvite[0].status).toBe("REJECTED");
    expect(fake.state.committed.provider.find((p) => p.id === "staged-1")).toBeUndefined();
  });
});
