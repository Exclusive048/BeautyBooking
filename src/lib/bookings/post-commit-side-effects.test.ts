import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * RES-03 / RES-13 / RES-15 — «побочный эффект после коммита не отменяет
 * успешную бронь, а неожиданный throw не ломает конверт ответа».
 *
 * Три части одной темы:
 *
 * RES-03 — `scheduleBookingReminders` бросает (в проде `enqueue` при
 *   недоступном Redis поднимает ошибку), а вызывался он ПОСЛЕ коммита
 *   транзакции без защиты в двух create-путях из трёх. Бронь в БД, ответ 500:
 *   клиент без `x-idempotency-key` создаёт вторую.
 * RES-15 — пакетные пути не звали планировщик вообще.
 * RES-13 — два публичных роута booking-флоу без `try/catch`: неожиданный
 *   throw отдавал HTML-страницу 500 вместо `{ ok:false, error }`.
 */

const logError = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const bookingFindUnique = vi.hoisted(() => vi.fn());
const resolveProviderBySlugOrId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/logger", () => ({
  logError,
  logInfo: vi.fn(),
  getRequestId: () => "req-test",
}));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: bookingFindUnique },
    service: { findUnique: vi.fn() },
    discountRule: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/providers/resolve-provider", () => ({ resolveProviderBySlugOrId }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";

const SRC_ROOT = resolve(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("RES-03 · планирование напоминаний не отменяет созданную бронь", () => {
  beforeEach(() => {
    logError.mockReset();
    enqueue.mockReset();
    bookingFindUnique.mockReset();
  });

  it("отказ очереди проглатывается и логируется, вызывающий не падает", async () => {
    bookingFindUnique.mockResolvedValue({
      id: "b1",
      status: "CONFIRMED",
      startAtUtc: new Date(Date.now() + 26 * 60 * 60 * 1000),
      silentMode: false,
      provider: { remindersEnabled: true },
    });
    // Ровно та ошибка, которую `enqueue` поднимает в проде при мёртвом Redis.
    enqueue.mockRejectedValue(new Error("Queue requires Redis: enqueue"));

    await expect(scheduleBookingRemindersSafe("b1")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[1]).toMatchObject({ bookingId: "b1" });
  });

  it("успешный путь не логирует ошибку и доходит до очереди", async () => {
    bookingFindUnique.mockResolvedValue({
      id: "b2",
      status: "CONFIRMED",
      startAtUtc: new Date(Date.now() + 26 * 60 * 60 * 1000),
      silentMode: false,
      provider: { remindersEnabled: true },
    });
    enqueue.mockResolvedValue(undefined);

    await scheduleBookingRemindersSafe("b2");
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it("пост-коммитные вызывающие берут только safe-вариант", () => {
    // Обёртка бесполезна, если рядом остаётся сырой бросающий вызов: guard
    // обходит дерево, поэтому и шестой путь придётся заводить через неё.
    const offenders = walk(SRC_ROOT).filter((file) => {
      if (file.endsWith(join("lib", "bookings", "reminders.ts"))) return false;
      return /\bscheduleBookingReminders\s*\(/.test(readFileSync(file, "utf8"));
    });
    expect(offenders).toEqual([]);
  });
});

describe("RES-15 · пакетные брони планируют напоминания", () => {
  const files = [
    resolve(SRC_ROOT, "lib/bookings/package-booking.ts"),
    resolve(SRC_ROOT, "lib/bookings/package-booking-studio.ts"),
  ];

  it("оба пакетных пути зовут планировщик на каждый компонент", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/scheduleBookingRemindersSafe\(/);
      // На каждый компонент, а не один раз на пакет: компоненты могут стоять
      // в разные дни, и одна задача покрыла бы только один из них.
      expect(source).toMatch(/for \(const bookingId of result\.bookingIds\)/);
    }
  });
});

describe("RES-13 · публичные роуты booking-флоу отвечают JSON-конвертом", () => {
  beforeEach(() => {
    resolveProviderBySlugOrId.mockReset();
    logError.mockReset();
  });

  it("slots: неожиданный throw → 500 с { ok:false }, а не HTML Next", async () => {
    resolveProviderBySlugOrId.mockRejectedValue(new Error("db connection lost"));
    const { GET } = await import("@/app/api/public/providers/[providerId]/slots/route");

    const res = await GET(
      new Request("https://example.test/api/public/providers/p1/slots?serviceId=s1&from=2026-03-01"),
      { params: { providerId: "p1" } }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error?.message).toBe("string");
  });

  it("booking-days: неожиданный throw → 500 с { ok:false }, а не HTML Next", async () => {
    resolveProviderBySlugOrId.mockRejectedValue(new Error("db connection lost"));
    const { GET } = await import("@/app/api/public/providers/[providerId]/booking-days/route");

    const res = await GET(
      new Request("https://example.test/api/public/providers/p1/booking-days?from=2026-03-01&limit=3"),
      { params: { providerId: "p1" } }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error?.message).toBe("string");
  });
});
