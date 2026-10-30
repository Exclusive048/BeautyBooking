import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MEDIA_CLEANUP_JOB_TYPE, PLAN_EDITED_NOTIFY_JOB_TYPE, type Job } from "@/lib/queue/types";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => state.client,
  withRedisCommandTimeout: (_op: string, p: Promise<unknown>) => p,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
// isProduction=true → no memory fallback; every op goes through the fake Redis
// (the real production code path we want to test).
vi.mock("@/lib/env", () => ({ isProduction: true }));

import {
  QUEUE_LUA_SCRIPTS,
  acknowledge,
  dequeue,
  enqueue,
  getQueueStats,
  heartbeatJob,
  recoverStuckJobs,
} from "@/lib/queue/queue";

const QUEUE = "queue:jobs";
const PROCESSING = "queue:processing";
const HEARTBEAT = "queue:processing:heartbeat";
const DELAYED = "queue:delayed";
const DELAYED_JOBS = "queue:delayed:jobs";
const LEASE_MS = 5 * 60 * 1000;

/**
 * Minimal in-memory node-redis stand-in covering the list/hash/zset ops the
 * queue uses. Каждый метод выполняется синхронно в момент вызова, поэтому
 * чередование возможно ТОЛЬКО между await'ами кода очереди — ровно как у
 * настоящего Redis, который выполняет команды по одной. `eval` исполняет
 * скрипты очереди целиком без await внутри: это и есть атомарность EVAL.
 */
class FakeRedis {
  lists = new Map<string, string[]>();
  hashes = new Map<string, Map<string, string>>();
  zsets = new Map<string, Map<string, number>>();
  calls = new Map<string, number>();

  private count(op: string) {
    this.calls.set(op, (this.calls.get(op) ?? 0) + 1);
  }
  private zset(k: string): Map<string, number> {
    let z = this.zsets.get(k);
    if (!z) {
      z = new Map();
      this.zsets.set(k, z);
    }
    return z;
  }

  private list(k: string): string[] {
    let l = this.lists.get(k);
    if (!l) {
      l = [];
      this.lists.set(k, l);
    }
    return l;
  }
  private hash(k: string): Map<string, string> {
    let h = this.hashes.get(k);
    if (!h) {
      h = new Map();
      this.hashes.set(k, h);
    }
    return h;
  }

  async lMove(src: string, dst: string, from: "LEFT" | "RIGHT", to: "LEFT" | "RIGHT") {
    this.count("lMove");
    const s = this.list(src);
    const v = from === "LEFT" ? s.shift() : s.pop();
    if (v === undefined) return null;
    const d = this.list(dst);
    if (to === "LEFT") d.unshift(v);
    else d.push(v);
    return v;
  }
  async lRem(key: string, count: number, value: string) {
    const l = this.list(key);
    let removed = 0;
    for (let i = 0; i < l.length && removed < Math.abs(count); ) {
      if (l[i] === value) {
        l.splice(i, 1);
        removed += 1;
      } else i += 1;
    }
    return removed;
  }
  async rPush(key: string, value: string) {
    this.list(key).push(value);
    return this.list(key).length;
  }
  async lPush(key: string, value: string) {
    this.list(key).unshift(value);
    return this.list(key).length;
  }
  async lRange(key: string, start: number, stop: number) {
    const l = this.list(key);
    return stop === -1 ? [...l.slice(start)] : [...l.slice(start, stop + 1)];
  }
  async hSet(key: string, field: string, value: string) {
    this.hash(key).set(field, value);
    return 1;
  }
  async hGetAll(key: string) {
    return Object.fromEntries(this.hash(key));
  }
  async hDel(key: string, field: string) {
    return this.hash(key).delete(field) ? 1 : 0;
  }
  async lLen(key: string) {
    return this.list(key).length;
  }
  async lIndex(key: string, index: number) {
    return this.list(key)[index] ?? null;
  }
  async zCard(key: string) {
    return this.zset(key).size;
  }
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    this.count("eval");
    const [k1, k2, k3] = options.keys;
    const args = options.arguments;
    if (script === QUEUE_LUA_SCRIPTS.addDelayed) {
      const z = this.zset(k1);
      const added = z.has(args[1]) ? 0 : 1;
      if (added) z.set(args[1], Number(args[0]));
      if (added || !this.hash(k2).has(args[1])) this.hash(k2).set(args[1], args[2]);
      return added;
    }
    if (script === QUEUE_LUA_SCRIPTS.promoteDue) {
      const z = this.zset(k1);
      const ids = [...z.entries()]
        .filter(([, score]) => score <= Number(args[0]))
        .sort((a, b) => a[1] - b[1])
        .slice(0, Number(args[1]))
        .map(([member]) => member);
      let moved = 0;
      for (const id of ids) {
        const payload = this.hash(k2).get(id);
        z.delete(id);
        this.hash(k2).delete(id);
        if (payload !== undefined) {
          this.list(k3).push(payload);
          moved += 1;
        }
      }
      return [moved, ids.length];
    }
    throw new Error("FakeRedis: unknown script");
  }

  // test helpers
  listLen(key: string) {
    return this.list(key).length;
  }
  zsetMembers(key: string) {
    return [...this.zset(key).keys()];
  }
  callCount(op: string) {
    return this.calls.get(op) ?? 0;
  }
  hashKeys(key: string) {
    return [...this.hash(key).keys()];
  }
}

function mediaJob(id: string): Job {
  return { id, type: MEDIA_CLEANUP_JOB_TYPE, payload: {} } as Job;
}
function notifyJob(id: string): Job {
  return {
    id,
    type: PLAN_EDITED_NOTIFY_JOB_TYPE,
    payload: { planId: "p", planCode: "PRO", summary: "s" },
  } as Job;
}

let fake: FakeRedis;
let now = 1_700_000_000_000;

beforeEach(() => {
  fake = new FakeRedis();
  state.client = fake;
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("queue — HARDENING-07 FIX-12 (no stampless-limbo)", () => {
  it("dequeue leaves the job in PROCESSING (never neither list) + records a side-hash heartbeat", async () => {
    await enqueue(mediaJob("j1"));
    const job = await dequeue();

    expect(job?.id).toBe("j1");
    expect(fake.listLen(QUEUE)).toBe(0); // moved out of pending
    expect(fake.listLen(PROCESSING)).toBe(1); // in processing (as lMove left it)
    expect(fake.hashKeys(HEARTBEAT)).toEqual(["j1"]); // start-time in the side hash
    // No in-place re-write → the exact enqueued string is what sits in processing.
    expect(JSON.parse(fake.lists.get(PROCESSING)![0]).id).toBe("j1");
  });

  it("a job in processing with NO heartbeat (crash after lMove before hSet) is ADOPTED, not lost", async () => {
    // Simulate the crash window: job is in processing, heartbeat hash is empty.
    fake.lists.set(PROCESSING, [JSON.stringify(mediaJob("orphan"))]);

    const recovered1 = await recoverStuckJobs();
    // Adopted this cycle: still in processing, now stamped, NOT recovered/lost.
    expect(recovered1).toBe(0);
    expect(fake.listLen(PROCESSING)).toBe(1);
    expect(fake.listLen(QUEUE)).toBe(0);
    expect(fake.hashKeys(HEARTBEAT)).toEqual(["orphan"]);

    // If truly orphaned, its adopted stamp goes stale → recovered next cycle.
    now += LEASE_MS + 1000;
    const recovered2 = await recoverStuckJobs();
    expect(recovered2).toBe(1);
    expect(fake.listLen(PROCESSING)).toBe(0);
    expect(fake.listLen(QUEUE)).toBe(1);
    expect(fake.hashKeys(HEARTBEAT)).toEqual([]);
  });
});

describe("queue — HARDENING-07 FIX-15 (heartbeat lease, not fixed-from-start)", () => {
  it("a LIVE long-running job (fresh heartbeat) past the old 5-min window is NOT re-queued", async () => {
    await enqueue(mediaJob("live"));
    await dequeue(); // heartbeat = T0

    now += LEASE_MS + 60_000; // 6 min later — past the old fixed window
    await heartbeatJob("live"); // worker renewed the lease

    const recovered = await recoverStuckJobs();
    expect(recovered).toBe(0);
    expect(fake.listLen(PROCESSING)).toBe(1); // still running, kept
    expect(fake.listLen(QUEUE)).toBe(0);
  });

  it("a DEAD job (stale heartbeat) is recovered exactly once", async () => {
    await enqueue(mediaJob("dead"));
    await dequeue(); // heartbeat = T0

    now += LEASE_MS + 1000; // stale, no renewal

    const recovered1 = await recoverStuckJobs();
    expect(recovered1).toBe(1);
    expect(fake.listLen(PROCESSING)).toBe(0);
    expect(fake.listLen(QUEUE)).toBe(1);
    const requeued = JSON.parse(fake.lists.get(QUEUE)![0]);
    expect(requeued.id).toBe("dead");
    expect(requeued.attempts).toBe(1);
    expect(fake.hashKeys(HEARTBEAT)).toEqual([]);

    // Not re-queued a second time (already out of processing).
    const recovered2 = await recoverStuckJobs();
    expect(recovered2).toBe(0);
    expect(fake.listLen(QUEUE)).toBe(1);
  });

  it("a recovered notification job is re-queued once (not double-fired)", async () => {
    await enqueue(notifyJob("notif"));
    await dequeue();
    now += LEASE_MS + 1000;

    await recoverStuckJobs();
    expect(fake.listLen(QUEUE)).toBe(1); // exactly one copy back in the queue
  });
});

describe("queue — ack cleanup (no side-hash leak)", () => {
  it("acknowledge removes the job from processing AND drops its heartbeat entry", async () => {
    await enqueue(mediaJob("ackme"));
    const job = await dequeue();
    expect(fake.hashKeys(HEARTBEAT)).toEqual(["ackme"]);

    await acknowledge(job!);
    expect(fake.listLen(PROCESSING)).toBe(0);
    expect(fake.hashKeys(HEARTBEAT)).toEqual([]);
  });

  it("recoverStuckJobs prunes an orphan heartbeat entry (job no longer in processing)", async () => {
    // Heartbeat entry with no matching processing job (e.g. a failed clear on ack).
    fake.hashes.set(HEARTBEAT, new Map([["ghost", String(now)]]));
    await recoverStuckJobs();
    expect(fake.hashKeys(HEARTBEAT)).toEqual([]);
  });
});

describe("queue — LOGIC-15 (восстановление ровно один раз при ≥2 воркерах)", () => {
  it("два одновременных прогона восстановления кладут задачу в очередь ОДИН раз", async () => {
    await enqueue(mediaJob("racy"));
    await dequeue();
    now += LEASE_MS + 1000; // просрочка лизинга — оба прогона увидят её как бесхозную

    // Оба читают ОДИН И ТОТ ЖЕ снапшот processing до того, как кто-то из них
    // успел удалить элемент, — это и есть гонка из находки. Раньше результат
    // `lRem` отбрасывался, и `lPush` делали оба.
    const [first, second] = await Promise.all([recoverStuckJobs(), recoverStuckJobs()]);

    expect(fake.listLen(QUEUE)).toBe(1); // ровно одна копия вернулась в очередь
    expect(fake.listLen(PROCESSING)).toBe(0);
    expect(first + second).toBe(1); // и ровно один прогон засчитал восстановление
  });

  it("проигравший прогон не сносит heartbeat нового исполнителя", async () => {
    await enqueue(mediaJob("racy"));
    await dequeue();
    now += LEASE_MS + 1000;

    await Promise.all([recoverStuckJobs(), recoverStuckJobs()]);

    // Победитель снял отметку сам; проигравший не должен был трогать хэш
    // повторно — иначе он мог бы снести отметку уже нового исполнителя.
    expect(fake.hashKeys(HEARTBEAT)).toEqual([]);
    const requeued = JSON.parse(fake.lists.get(QUEUE)![0]);
    expect(requeued.attempts).toBe(1); // одна попытка, а не две
  });
});

/**
 * QUEUE-RETRY-POLICY-PER-TYPE: предел восстановлений считается по `_recoveries`.
 *
 * @probe Вернул условие `attempts <= MAX_RECOVERY_ATTEMPTS` в Redis-ветку
 * `recoverStuckJobs` — первый тест краснеет: «expected 0 to be 1» (задача с
 * пятью обычными повторами ушла в мёртвые на первом же падении воркера).
 */
describe("queue — QUEUE-RETRY-POLICY-PER-TYPE (предел восстановлений)", () => {
  it("задача с несколькими обычными повторами восстанавливается, а не умирает", async () => {
    await enqueue({ ...mediaJob("long"), attempts: 5 } as Job);
    await dequeue();
    now += LEASE_MS + 1000;

    const recovered = await recoverStuckJobs();
    expect(recovered).toBe(1);
    const requeued = JSON.parse(fake.lists.get(QUEUE)![0]);
    expect(requeued.attempts).toBe(6);
    expect(requeued._recoveries).toBe(1);
    expect(fake.listLen("queue:dead")).toBe(0);
  });

  it("четвёртое восстановление уводит задачу в мёртвые", async () => {
    await enqueue({ ...mediaJob("poison"), _recoveries: 3 } as Job);
    await dequeue();
    now += LEASE_MS + 1000;

    const recovered = await recoverStuckJobs();
    expect(recovered).toBe(0);
    expect(fake.listLen(QUEUE)).toBe(0);
    const dead = JSON.parse(fake.lists.get("queue:dead")![0]);
    expect(dead.id).toBe("poison");
    expect(dead._recoveries).toBe(4);
  });
});

function futureJob(id: string, runAt: number): Job {
  return { ...mediaJob(id), runAt, scheduledAt: runAt } as Job;
}

/**
 * @probe   что сломать: в `promoteDueJobs` заменить скрипт на три команды
 *          (`zRangeByScore` → `rPush` каждой → `zRem`) с await между ними.
 *          наблюдалось: «два одновременных переноса» красный — 300 копий
 *          вместо 150 (оба dequeue прочитали один набор до удаления).
 *          Вторая проба: вернуть прежнюю ветку будущей задачи в `dequeue`
 *          (`rPush` обратно в хвост + `return null`) — «самомиграция» красный:
 *          `dequeue` отдаёт `null`, срочная остаётся в хвосте за 1 000 будущими.
 */
describe("queue — QUEUE-DELAYED-ZSET (A-01: отложенные отдельно от готовых)", () => {
  it("1 000 будущих задач не задерживают срочную: она выходит за одно чтение списка", async () => {
    for (let i = 0; i < 1000; i += 1) {
      await enqueue(mediaJob(`later-${i}`), { delayMs: 24 * 60 * 60 * 1000 });
    }
    await enqueue(mediaJob("urgent"));

    expect(fake.listLen(QUEUE)).toBe(1); // в готовом списке — только срочная
    expect(fake.zsetMembers(DELAYED)).toHaveLength(1000);

    const lMovesBefore = fake.callCount("lMove");
    const job = await dequeue();
    expect(job?.id).toBe("urgent");
    expect(fake.callCount("lMove") - lMovesBefore).toBe(1);
  });

  it("самомиграция: 1 000 будущих задач старого формата впереди срочной — она выходит за ОДИН dequeue", async () => {
    // Прежний формат: всё в одном списке, будущие — впереди.
    const legacy = Array.from({ length: 1000 }, (_, i) =>
      JSON.stringify(futureJob(`legacy-${i}`, now + 60 * 60 * 1000))
    );
    fake.lists.set(QUEUE, [...legacy, JSON.stringify(mediaJob("urgent"))]);

    const job = await dequeue(); // одна итерация цикла воркера, без сна
    expect(job?.id).toBe("urgent");
    expect(fake.listLen(QUEUE)).toBe(0);
    expect(fake.zsetMembers(DELAYED)).toHaveLength(1000); // будущие переехали в ZSET
    expect(fake.listLen(PROCESSING)).toBe(1); // только срочная: мигрированные из processing ушли
    expect(fake.hashKeys(DELAYED_JOBS)).toHaveLength(1000);
  });

  it("созревшая задача переносится в готовые и выдаётся, раньше — нет", async () => {
    await enqueue(mediaJob("soon"), { delayMs: 60_000 });
    expect(await dequeue()).toBeNull();

    now += 60_000;
    const job = await dequeue();
    expect(job?.id).toBe("soon");
    expect(fake.zsetMembers(DELAYED)).toEqual([]);
    expect(fake.hashKeys(DELAYED_JOBS)).toEqual([]);
  });

  it("два одновременных переноса не задваивают задачу", async () => {
    // 150 созревших — больше одной пачки скрипта (100), то есть переносов
    // в каждом dequeue несколько, и они чередуются с чужими.
    for (let i = 0; i < 150; i += 1) {
      await enqueue(mediaJob(`due-${i}`), { delayMs: 1000 });
    }
    now += 1000;

    const [a, b] = await Promise.all([dequeue(), dequeue()]);
    expect(a?.id).toBeTruthy();
    expect(b?.id).toBeTruthy();
    expect(a?.id).not.toBe(b?.id);

    const ids = [...(fake.lists.get(QUEUE) ?? []), ...(fake.lists.get(PROCESSING) ?? [])].map(
      (raw) => JSON.parse(raw).id as string
    );
    expect(ids).toHaveLength(150);
    expect(new Set(ids).size).toBe(150);
    expect(fake.zsetMembers(DELAYED)).toEqual([]);
  });

  it("ZADD NX по id: повторная постановка той же отложенной задачи копии не создаёт", async () => {
    await enqueue(mediaJob("same"), { delayMs: 60_000 });
    await enqueue(mediaJob("same"), { delayMs: 120_000 });
    expect(fake.zsetMembers(DELAYED)).toEqual(["same"]);
    // Побеждает первая постановка — время запуска не сдвинулось.
    expect(fake.zsets.get(DELAYED)!.get("same")).toBe(now + 60_000);
  });

  it("восстановление будущей задачи (сбой посреди самомиграции) кладёт её в ZSET, а не в готовые", async () => {
    fake.lists.set(PROCESSING, [JSON.stringify(futureJob("stuck-future", now + 60 * 60 * 1000))]);
    fake.hashes.set(HEARTBEAT, new Map([["stuck-future", String(now - LEASE_MS - 1000)]]));

    const recovered = await recoverStuckJobs();
    expect(recovered).toBe(1);
    expect(fake.listLen(QUEUE)).toBe(0);
    expect(fake.zsetMembers(DELAYED)).toEqual(["stuck-future"]);
  });

  it("статистика: готовые и отложенные — разные числа, возраст головы очереди считается", async () => {
    await enqueue(mediaJob("ready-1"));
    now += 30_000;
    await enqueue(mediaJob("ready-2"));
    await enqueue(mediaJob("later"), { delayMs: 60 * 60 * 1000 });

    const stats = await getQueueStats();
    expect(stats.pending).toBe(2);
    expect(stats.delayed).toBe(1);
    expect(stats.oldestPendingAgeMs).toBe(30_000);
  });
});
