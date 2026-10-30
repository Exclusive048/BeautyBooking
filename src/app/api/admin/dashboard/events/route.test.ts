import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADMIN-EVENTS-SINCE-TRAIL (D-01) — «История событий» несёт полные имена,
 * телефоны и почты, поэтому каждая её страница пишет след чтения ПДн
 * (`admin.events.list`, RKN-FIX-10). Без следа идёт только опрос новых
 * (`since`), и это честно лишь пока опрос структурно узкий. Раньше `since=1`
 * вместе с курсором листал всю историю, и ни одна страница следа не оставляла.
 *
 * Сервис здесь НАСТОЯЩИЙ: Prisma отдаёт пустые выборки, подменён только
 * писатель следа. Иначе тест проверял бы, что роут передаёт `sinceMs` в мок, а
 * не то, пишется ли след на самом деле.
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. убрать из роута ветку `if (parsed.data.cursor) return fail(…)` (ровно та
 *      форма, что была до фикса: since и курсор принимаются вместе) → 1 failed:
 *      «since вместе с курсором — 400» — «since=1793359800000&limit=100&cursor=…:
 *      expected 200 to be 400». Первая версия теста брала `since=1` и на этой
 *      пробе ОСТАЛАСЬ ЗЕЛЁНОЙ: такой since отсекает и одно окно, ветка курсора
 *      не проверялась вовсе — поэтому since в запросе теперь внутри окна;
 *   2. заменить проверку окна на правдоподобное «только положительное время»
 *      (`since < 1`) → 1 failed: «since старше часа — 400» — «since=1: expected
 *      200 to be 400»;
 *   3. в сервисе писать след при любом `sinceMs` (`if (opts.actor)`) → 1
 *      failed: «опрос в пределах часа принимается и следа не пишет» —
 *      «expected "vi.fn()" to not be called at all, but actually been called 1
 *      times»: опрос раз в 30 с дал бы детектору аномалий до 120 событий в час.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const recordPdAccess = vi.hoisted(() => vi.fn(async () => {}));
const findMany = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/audit/pd-access", () => ({
  recordPdAccess,
  buildFilterFingerprint: () => "fp",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: () => ({ findMany }) }),
}));

import { GET } from "./route";
import { encodeAdminEventsCursor } from "@/features/admin-cabinet/dashboard/server/events.service";
import { ADMIN_EVENTS_POLL_WINDOW_MS } from "@/features/admin-cabinet/dashboard/lib/event-categories";

const NOW = new Date("2026-10-30T12:00:00.000Z").getTime();
const MINUTE = 60_000;
const CURSOR = encodeAdminEventsCursor({ ms: NOW - 3 * 24 * 60 * MINUTE, rank: 0, id: "b1" });

const get = (query: string) => GET(new NextRequest(`http://localhost/api/admin/dashboard/events?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  requireAdminAuth.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/dashboard/events — опрос новых узкий, листание со следом", () => {
  it("since вместе с курсором — 400, история не читается", async () => {
    // since внутри окна: проверяется именно запрет сочетания, а не окно —
    // иначе `since=1` отсекло бы и одно окно, и ветка курсора не проверялась.
    const recent = encodeAdminEventsCursor({ ms: NOW - 5 * MINUTE, rank: 0, id: "b1" });
    for (const query of [`since=${NOW - 30 * MINUTE}&limit=100&cursor=${recent}`, `since=1&cursor=${CURSOR}`]) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
    }
    expect(findMany).not.toHaveBeenCalled();
    expect(recordPdAccess).not.toHaveBeenCalled();
  });

  it("since старше часа — 400 (since=1 тоже)", async () => {
    for (const since of [1, NOW - ADMIN_EVENTS_POLL_WINDOW_MS - MINUTE]) {
      const res = await get(`since=${since}`);
      expect(res.status, `since=${since}`).toBe(400);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("опрос в пределах часа принимается и следа не пишет", async () => {
    const res = await get(`since=${NOW - 59 * MINUTE}&limit=100`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: unknown[]; asOfMs: number } };
    expect(body.data.items).toEqual([]);
    expect(body.data.asOfMs).toBe(NOW);
    expect(recordPdAccess).not.toHaveBeenCalled();
  });

  it("обычная страница пишет след admin.events.list", async () => {
    const res = await get("limit=50");
    expect(res.status).toBe(200);
    expect(recordPdAccess).toHaveBeenCalledTimes(1);
    expect(recordPdAccess).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "admin.events.list", actorUserId: "admin-1" }),
    );
  });

  it("«Показать ещё» по курсору пишет след", async () => {
    const res = await get(`cursor=${CURSOR}&limit=50`);
    expect(res.status).toBe(200);
    expect(recordPdAccess).toHaveBeenCalledTimes(1);
    expect(recordPdAccess).toHaveBeenCalledWith(expect.objectContaining({ surface: "admin.events.list" }));
  });
});
