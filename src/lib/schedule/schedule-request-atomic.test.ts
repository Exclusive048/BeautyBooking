import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-REQUEST-ATOMIC — заявку мастера на расписание в студии правят двое
 * одновременно: мастер дописывает в неё дни (`submitStudioScheduleChange`), а
 * администратор студии одобряет или отклоняет её. Проверяется поведение при
 * пересечении, а не форма кода: правка мастера не теряется (попадает либо в
 * одобренное, либо в новую открытую заявку), второе решение получает 409,
 * расписание применено не больше одного раза, открытая заявка у профиля одна.
 *
 * ⚠️ Настоящей БД в прогоне нет, поэтому база здесь — двойник с семантикой
 * Postgres в Read Committed, ровно той, на которую опирается код: `SELECT …
 * FOR UPDATE` и UPDATE/DELETE ждут блокировку строки до коммита держателя и
 * перепроверяют условие на свежей версии строки (не прошла — строка не
 * возвращается и не меняется); кандидаты оператора берутся на его начало;
 * `pg_advisory_xact_lock` — очередь до конца транзакции; откат снимает
 * записи и блокировки. Что так и устроено в Postgres, двойник не доказывает —
 * он доказывает, что код берёт блокировки в нужном порядке и читает уже под
 * ними. Пересечения — точками ожидания внутри применения и сабмита.
 *
 * @probe 2026-10-30 — в сабмите блокировка открытой заявки заменена чтением
 * без блокировки (`findFirst` по PENDING): покраснели три — «сабмит во время
 * одобрения», «одобрение во время сабмита», «мастер отозвал заявку…»
 * (`promise rejected "Error: Заявка уже обработана. Обновите страницу."
 * instead of resolving`). Правку молча не теряет — запись с условием
 * `status: PENDING` её ловит, — но мастер получает ложный 409 вместо новой
 * заявки. Возвращено — зелёные.
 * @probe 2026-10-30 — в одобрении статус и тело прочитаны ДО блокировки строки:
 * покраснели три — порядок (`expected [ '1:read-request', …] to deeply equal
 * [ '1:lock-request', …]`), «одобрение во время сабмита» (применено
 * `[ '2026-10-07' ]` без дня X — правка ПОТЕРЯНА: устаревшее тело применено,
 * а X записан в уже одобренную заявку) и «два одобрения» (второе — 200,
 * расписание применено дважды). «Одобрение и отклонение» осталось зелёным —
 * его держит условная запись отклонения отдельно. Возвращено — зелёные.
 * @probe 2026-10-30 — в сабмите снята advisory-блокировка профиля: покраснел
 * «два сабмита без открытой заявки» (`expected 'created' to be 'updated'` —
 * две открытые заявки). Возвращено — зелёные.
 */

type Status = "PENDING" | "APPROVED" | "REJECTED";
type Row = {
  id: string;
  providerId: string;
  studioId: string | null;
  status: Status;
  payloadJson: unknown;
  comment: string | null;
  createdAt: number;
};

const fake = vi.hoisted(() => {
  const rows = new Map<string, Row>();
  const locks = new Map<string, { owner: number; released: Promise<void>; release: () => void }>();
  const log: string[] = [];
  const counters = { seq: 0, clock: 0, owner: 0 };
  const templates = new Set<string>();
  const hooks = {
    duringApply: null as null | (() => Promise<void>),
    duringSubmit: null as null | (() => Promise<void>),
  };
  const spies = {
    painted: [] as string[],
    submittedNotified: [] as string[],
    approvedNotified: [] as string[],
    rejectedNotified: [] as string[],
    invalidated: [] as string[],
  };

  async function acquire(key: string, owner: number): Promise<void> {
    for (;;) {
      const held = locks.get(key);
      if (!held) {
        let release!: () => void;
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        locks.set(key, { owner, released, release });
        return;
      }
      if (held.owner === owner) return;
      await held.released;
    }
  }

  function releaseAll(owner: number): void {
    for (const [key, held] of [...locks.entries()]) {
      if (held.owner !== owner) continue;
      locks.delete(key);
      held.release();
    }
  }

  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value);
  }

  type Undo = Array<() => void>;

  function requestDelegate(owner: number | null, undo: Undo | null) {
    // Запись без транзакции — свой короткий «autocommit»: блокировка строки на
    // время оператора.
    async function withWriteOwner<T>(fn: (writer: number) => Promise<T>): Promise<T> {
      if (owner !== null) return fn(owner);
      const writer = ++counters.owner;
      try {
        return await fn(writer);
      } finally {
        releaseAll(writer);
      }
    }
    function remember(id: string): void {
      const before = rows.get(id);
      undo?.push(() => {
        if (before) rows.set(id, before);
        else rows.delete(id);
      });
    }

    return {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = [...rows.values()]
          .filter((row) => matches(row, where))
          .sort((left, right) => right.createdAt - left.createdAt)[0];
        return found ? { ...found } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        log.push(`${owner}:read-request`);
        const row = rows.get(where.id);
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "comment"> }) => {
        const id = `req-new-${++counters.seq}`;
        remember(id);
        rows.set(id, { ...data, id, comment: null, createdAt: ++counters.clock });
        log.push(`${owner}:create`);
        return { id };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) =>
        withWriteOwner(async (writer) => {
          await acquire(`row:${where.id}`, writer);
          const row = rows.get(where.id);
          if (!row) throw new Error("record not found");
          remember(where.id);
          rows.set(where.id, { ...row, ...data });
          log.push(`${owner}:update-${String(data.status ?? "payload")}`);
          return { ...row, ...data };
        }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) =>
        withWriteOwner(async (writer) => {
          const candidates = [...rows.values()].filter((row) => matches(row, where)).map((row) => row.id);
          let count = 0;
          for (const id of candidates) {
            await acquire(`row:${id}`, writer);
            const fresh = rows.get(id);
            if (!fresh || !matches(fresh, where)) continue;
            remember(id);
            rows.set(id, { ...fresh, ...data });
            count += 1;
          }
          log.push(`${owner}:update-many`);
          return { count };
        }),
      deleteMany: async ({ where }: { where: Record<string, unknown> }) =>
        withWriteOwner(async (writer) => {
          const candidates = [...rows.values()].filter((row) => matches(row, where)).map((row) => row.id);
          let count = 0;
          for (const id of candidates) {
            await acquire(`row:${id}`, writer);
            const fresh = rows.get(id);
            if (!fresh || !matches(fresh, where)) continue;
            remember(id);
            rows.delete(id);
            count += 1;
          }
          return { count };
        }),
    };
  }

  type RawQuery = { strings: readonly string[]; values: readonly unknown[] };

  function makeClient(owner: number | null, undo: Undo | null) {
    const client = {
      provider: { findUnique: async () => ({ timezone: "Europe/Moscow" }) },
      studio: { findUnique: async () => ({ id: "studio-1" }) },
      scheduleChangeRequest: requestDelegate(owner, undo),
      scheduleOverride: {
        findMany: async () => {
          await hooks.duringSubmit?.();
          return [];
        },
      },
      scheduleTemplate: {
        count: async ({ where }: { where: { id: string } }) => (templates.has(where.id) ? 1 : 0),
      },
      $executeRaw: async (query: RawQuery) => {
        if (owner === null) throw new Error("advisory xact lock outside a transaction");
        const text = query.strings.join("?");
        if (!text.includes("pg_advisory_xact_lock")) throw new Error(`unexpected executeRaw: ${text}`);
        await acquire(`adv:${String(query.values[0])}`, owner);
        log.push(`${owner}:lock-profile`);
        return 1;
      },
      $queryRaw: async (query: RawQuery) => {
        if (owner === null) throw new Error("FOR UPDATE outside a transaction");
        const text = query.strings.join("?");
        if (!text.includes("FOR UPDATE")) throw new Error(`unexpected queryRaw: ${text}`);
        if (text.includes("WHERE id =")) {
          const [id, studioId] = query.values as [string, string];
          const seen = rows.get(id);
          if (!seen || seen.studioId !== studioId) return [];
          await acquire(`row:${id}`, owner);
          log.push(`${owner}:lock-request`);
          const fresh = rows.get(id);
          return fresh && fresh.studioId === studioId ? [{ id }] : [];
        }
        if (text.includes('"providerId" =') && text.includes("'PENDING'")) {
          const [providerId] = query.values as [string];
          // Кандидаты — на начало оператора, по убыванию даты создания.
          const candidates = [...rows.values()]
            .filter((row) => row.providerId === providerId && row.status === "PENDING")
            .sort((left, right) => right.createdAt - left.createdAt)
            .map((row) => row.id);
          for (const id of candidates) {
            await acquire(`row:${id}`, owner);
            const fresh = rows.get(id);
            if (fresh && fresh.status === "PENDING" && fresh.providerId === providerId) {
              log.push(`${owner}:lock-open-request`);
              return [{ id }];
            }
          }
          log.push(`${owner}:lock-open-request:none`);
          return [];
        }
        throw new Error(`unexpected queryRaw: ${text}`);
      },
      $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
        const txOwner = ++counters.owner;
        const txUndo: Undo = [];
        try {
          const result = await fn(makeClient(txOwner, txUndo));
          log.push(`${txOwner}:commit`);
          return result;
        } catch (error) {
          for (const step of txUndo.reverse()) step();
          log.push(`${txOwner}:rollback`);
          throw error;
        } finally {
          releaseAll(txOwner);
        }
      },
    };
    return client;
  }

  return { rows, locks, log, counters, templates, hooks, spies, client: makeClient(null, null) };
});

vi.mock("@/lib/prisma", () => ({ prisma: fake.client }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => ({ id: "admin-1" }) }));
vi.mock("@/lib/studio/current", () => ({
  resolveCurrentStudioAccess: async () => ({ studioId: "studio-1", roles: ["OWNER"] }),
}));
vi.mock("@/lib/notifications/studio-notifications", () => ({
  loadScheduleRequestWithRelations: async (id: string) => ({ id }),
  notifyScheduleRequestSubmitted: async (request: { id: string }) => {
    fake.spies.submittedNotified.push(request.id);
  },
  notifyScheduleRequestApproved: async (request: { id: string }) => {
    fake.spies.approvedNotified.push(request.id);
  },
  notifyScheduleRequestRejected: async (request: { id: string }) => {
    fake.spies.rejectedNotified.push(request.id);
  },
}));
vi.mock("@/lib/schedule/slotsCache", () => ({
  invalidateSlotsForMaster: async (providerId: string) => {
    fake.spies.invalidated.push(providerId);
    fake.log.push("invalidate");
  },
}));
vi.mock("@/lib/schedule/calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/calendar")>()),
  paintScheduleDaysTx: async (_tx: unknown, _providerId: string, dates: string[]) => {
    fake.spies.painted.push(...dates);
    await fake.hooks.duringApply?.();
  },
}));
vi.mock("@/lib/schedule/patterns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/patterns")>()),
  readWeekRepresentation: async () => ({ state: "pattern", week: [] }),
  saveWeekAsPatternTx: async () => undefined,
}));
vi.mock("@/lib/schedule/pattern-apply", () => ({
  patternRequestForApproval: (raw: unknown) => raw,
  applyPatternRequestTx: async () => undefined,
}));

import { POST as approveRoute } from "@/app/api/studio/schedule/requests/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/studio/schedule/requests/[id]/reject/route";
import { submitStudioScheduleChange } from "@/lib/schedule/change-requests";
import { emptyScheduleChanges, type ScheduleChangesPayload } from "@/lib/schedule/schedule-changes-shared";

const NOW = new Date("2026-10-05T09:00:00.000Z"); // Москва: 5 октября
const DAY_A = "2026-10-07";
const DAY_B = "2026-10-08";
const DAY_X = "2026-10-09";

function seedOpenRequest(days: string[]): void {
  fake.rows.set("req-1", {
    id: "req-1",
    providerId: "prov-1",
    studioId: "studio-1",
    status: "PENDING",
    payloadJson: { ...emptyScheduleChanges(), days: days.map((date) => ({ date, action: { kind: "off" } })) },
    comment: null,
    createdAt: ++fake.counters.clock,
  });
}

function daysOf(row: Row | undefined): string[] {
  return ((row?.payloadJson as ScheduleChangesPayload | undefined)?.days ?? []).map((day) => day.date);
}

function submitDay(date: string) {
  return submitStudioScheduleChange({
    req: new Request("http://localhost/api/cabinet/master/schedule/calendar"),
    route: "PUT /test",
    providerId: "prov-1",
    studioProviderId: "studio-prov",
    change: { kind: "days", dates: [date], action: { kind: "off" } },
    now: NOW,
  });
}

async function approve(id = "req-1"): Promise<{ status: number; code?: string; message?: string }> {
  const response = await approveRoute(new Request(`http://localhost/api/studio/schedule/requests/${id}/approve`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
  const body = (await response.json()) as { error?: { code: string; message: string } };
  return { status: response.status, code: body.error?.code, message: body.error?.message };
}

async function reject(id = "req-1"): Promise<{ status: number; code?: string }> {
  const response = await rejectRoute(
    new Request(`http://localhost/api/studio/schedule/requests/${id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "Нужны вечерние окна." }),
    }),
    { params: Promise.resolve({ id }) },
  );
  const body = (await response.json()) as { error?: { code: string } };
  return { status: response.status, code: body.error?.code };
}

/** Дать соперникам дойти до их точки ожидания (двойник — только промисы). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function pendingRows(): Row[] {
  return [...fake.rows.values()].filter((row) => row.providerId === "prov-1" && row.status === "PENDING");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  fake.rows.clear();
  fake.locks.clear();
  fake.log.length = 0;
  fake.counters.seq = 0;
  fake.counters.clock = 0;
  fake.counters.owner = 0;
  fake.templates.clear();
  fake.hooks.duringApply = null;
  fake.hooks.duringSubmit = null;
  for (const list of Object.values(fake.spies)) list.length = 0;
});

describe("SCHEDULE-REQUEST-ATOMIC — одобрение и правка мастера", () => {
  it("одобрение: блокировка строки → чтение → применение → статус → коммит; кэш — после коммита", async () => {
    seedOpenRequest([DAY_A]);
    await expect(approve()).resolves.toMatchObject({ status: 200 });
    const tx = fake.log.find((entry) => entry.endsWith(":lock-request"))!.split(":")[0];
    const ops = fake.log.filter((entry) => entry.startsWith(`${tx}:`));
    expect(ops).toEqual([`${tx}:lock-request`, `${tx}:read-request`, `${tx}:update-APPROVED`, `${tx}:commit`]);
    expect(fake.log.indexOf("invalidate")).toBeGreaterThan(fake.log.indexOf(`${tx}:commit`));
    expect(fake.spies.painted).toEqual([DAY_A]);
    expect(fake.spies.approvedNotified).toEqual(["req-1"]);
  });

  it("сабмит во время одобрения: правка уходит в НОВУЮ заявку, одобренная — без неё", async () => {
    seedOpenRequest([DAY_A, DAY_B]);
    let submitted: Promise<string> | null = null;
    fake.hooks.duringApply = async () => {
      fake.hooks.duringApply = null;
      submitted = submitDay(DAY_X);
      await settle(); // сабмит дошёл до блокировки строки и ждёт
    };

    await expect(approve()).resolves.toMatchObject({ status: 200 });
    await expect(submitted).resolves.toBe("created");

    const approved = fake.rows.get("req-1");
    expect(approved?.status).toBe("APPROVED");
    expect(daysOf(approved)).toEqual([DAY_A, DAY_B]);
    expect(fake.spies.painted).toEqual([DAY_A, DAY_B]);

    const open = pendingRows();
    expect(open).toHaveLength(1);
    expect(daysOf(open[0])).toEqual([DAY_X]);
    expect(fake.spies.submittedNotified).toEqual([open[0]!.id]);
  });

  it("одобрение во время сабмита: правка, записанная первой, применяется вместе с заявкой", async () => {
    seedOpenRequest([DAY_A]);
    let approved: Promise<{ status: number }> | null = null;
    fake.hooks.duringSubmit = async () => {
      fake.hooks.duringSubmit = null;
      approved = approve();
      await settle(); // одобрение ждёт строку, которую держит сабмит
    };

    await expect(submitDay(DAY_X)).resolves.toBe("updated");
    await expect(approved).resolves.toMatchObject({ status: 200 });

    expect(fake.rows.get("req-1")?.status).toBe("APPROVED");
    expect(daysOf(fake.rows.get("req-1"))).toEqual([DAY_A, DAY_X]);
    expect(fake.spies.painted).toEqual([DAY_A, DAY_X]);
    expect(pendingRows()).toHaveLength(0);
  });

  it("два одобрения одновременно: расписание применено один раз, второе — 409", async () => {
    seedOpenRequest([DAY_A]);
    let second: Promise<{ status: number; code?: string; message?: string }> | null = null;
    fake.hooks.duringApply = async () => {
      fake.hooks.duringApply = null;
      second = approve();
      await settle();
    };

    await expect(approve()).resolves.toMatchObject({ status: 200 });
    await expect(second).resolves.toEqual({
      status: 409,
      code: "CONFLICT",
      message: "Заявка уже обработана. Обновите страницу.",
    });
    expect(fake.spies.painted).toEqual([DAY_A]);
    expect(fake.spies.approvedNotified).toEqual(["req-1"]);
    expect(fake.spies.invalidated).toHaveLength(1);
  });

  it("одобрение и отклонение одновременно: побеждает первое, второе — 409, статус не перезаписан", async () => {
    seedOpenRequest([DAY_A]);
    let rejected: Promise<{ status: number; code?: string }> | null = null;
    fake.hooks.duringApply = async () => {
      fake.hooks.duringApply = null;
      rejected = reject();
      await settle(); // UPDATE отклонения ждёт строку, которую держит одобрение
    };

    await expect(approve()).resolves.toMatchObject({ status: 200 });
    await expect(rejected).resolves.toEqual({ status: 409, code: "CONFLICT" });
    expect(fake.rows.get("req-1")).toMatchObject({ status: "APPROVED", comment: null });
    expect(fake.spies.rejectedNotified).toEqual([]);
  });

  it("сначала отклонили — одобрение 409 и ничего не применяет", async () => {
    seedOpenRequest([DAY_A]);
    await expect(reject()).resolves.toMatchObject({ status: 200 });
    await expect(approve()).resolves.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(fake.spies.painted).toEqual([]);
    expect(fake.spies.invalidated).toEqual([]);
    expect(fake.rows.get("req-1")?.status).toBe("REJECTED");
  });

  it("мастер отозвал заявку, пока её одобряли, — одобрение не находит её (404), расписание не тронуто", async () => {
    seedOpenRequest([DAY_A]);
    let approved: Promise<{ status: number }> | null = null;
    fake.hooks.duringSubmit = async () => {
      fake.hooks.duringSubmit = null;
      approved = approve();
      await settle();
    };
    // «Убрать из заявки» последний день — заявка опустела и удаляется.
    const withdrawn = submitStudioScheduleChange({
      req: new Request("http://localhost/api"),
      route: "PUT /test",
      providerId: "prov-1",
      studioProviderId: "studio-prov",
      change: { kind: "days", dates: [DAY_A], action: { kind: "withdraw" } },
      now: NOW,
    });
    await expect(withdrawn).resolves.toBe("withdrawn");
    await expect(approved).resolves.toMatchObject({ status: 404 });
    expect(fake.rows.has("req-1")).toBe(false);
    expect(fake.spies.painted).toEqual([]);
  });

  it("два сабмита без открытой заявки: одна заявка с обеими правками, студии — одно уведомление", async () => {
    let second: Promise<string> | null = null;
    fake.hooks.duringSubmit = async () => {
      fake.hooks.duringSubmit = null;
      second = submitDay(DAY_X);
      await settle(); // второй сабмит ждёт очередь профиля
    };

    await expect(submitDay(DAY_A)).resolves.toBe("created");
    await expect(second).resolves.toBe("updated");

    const open = pendingRows();
    expect(open).toHaveLength(1);
    expect(daysOf(open[0])).toEqual([DAY_A, DAY_X]);
    expect(fake.spies.submittedNotified).toEqual([open[0]!.id]);
  });

  it("правка после одобрения — новая заявка; одобренная не меняется", async () => {
    seedOpenRequest([DAY_A]);
    await expect(approve()).resolves.toMatchObject({ status: 200 });
    await expect(submitDay(DAY_X)).resolves.toBe("created");
    expect(daysOf(fake.rows.get("req-1"))).toEqual([DAY_A]);
    expect(pendingRows().map((row) => daysOf(row))).toEqual([[DAY_X]]);
  });

  it("откат одобрения (рабочий день удалён) — заявка остаётся открытой, кэш не трогаем", async () => {
    fake.rows.set("req-1", {
      id: "req-1",
      providerId: "prov-1",
      studioId: "studio-1",
      status: "PENDING",
      payloadJson: { ...emptyScheduleChanges(), days: [{ date: DAY_A, action: { kind: "template", templateId: "tpl-gone" } }] },
      comment: null,
      createdAt: 1,
    });
    await expect(approve()).resolves.toMatchObject({ status: 422, code: "INVALID_REQUEST_PAYLOAD" });
    expect(fake.rows.get("req-1")?.status).toBe("PENDING");
    expect(fake.spies.invalidated).toEqual([]);
    expect(fake.locks.size).toBe(0);
  });

  it("чужая студия — 404 без блокировки строки", async () => {
    seedOpenRequest([DAY_A]);
    fake.rows.set("req-1", { ...fake.rows.get("req-1")!, studioId: "studio-2" });
    await expect(approve()).resolves.toMatchObject({ status: 404 });
    expect(fake.log.some((entry) => entry.endsWith(":lock-request"))).toBe(false);
    expect(fake.spies.painted).toEqual([]);
  });
});
