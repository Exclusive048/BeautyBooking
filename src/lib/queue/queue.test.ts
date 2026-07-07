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
  acknowledge,
  dequeue,
  enqueue,
  heartbeatJob,
  recoverStuckJobs,
} from "@/lib/queue/queue";

const QUEUE = "queue:jobs";
const PROCESSING = "queue:processing";
const HEARTBEAT = "queue:processing:heartbeat";
const LEASE_MS = 5 * 60 * 1000;

/** Minimal in-memory node-redis stand-in covering the list/hash ops the queue uses. */
class FakeRedis {
  lists = new Map<string, string[]>();
  hashes = new Map<string, Map<string, string>>();

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

  // test helpers
  listLen(key: string) {
    return this.list(key).length;
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
