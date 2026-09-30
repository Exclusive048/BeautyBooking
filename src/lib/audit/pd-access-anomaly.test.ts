import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 16 (PD-ACCESS-ANOMALY-DETECTION) — пороги на границах,
 * режим наблюдения и форма сигнала (без IP и id человека — Telegram
 * иностранный сервис, ПДн туда нельзя).
 *
 * @probe 2026-09-29 — в `evaluatePdAccessWindow` сравнение `>` заменено на `>=`:
 *        красный «ровно на пороге — не аномалия». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findFirst: vi.fn(async () => ({ id: "pdlog-last" })),
  logInfo: vi.fn(),
  sendTelegramAlert: vi.fn(async () => true),
  reportMessage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { pdAccessLog: { groupBy: mocks.groupBy, findFirst: mocks.findFirst } } }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: mocks.logInfo, logError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: mocks.sendTelegramAlert }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: mocks.reportMessage }));

import {
  detectPdAccessAnomalies,
  evaluatePdAccessWindow,
  formatPdAnomalyAlert,
  PD_ANOMALY_ALERTS_ENABLED,
  PD_ANOMALY_THRESHOLDS,
} from "./pd-access-anomaly";

const row = (actorType: "ADMIN" | "MASTER" | "STUDIO" | "SYSTEM", rowSum: number, eventCount = 1) => ({
  actorUserId: "user-secret-id",
  actorType,
  surface: `${actorType.toLowerCase()}.clients.list`,
  rowSum,
  eventCount,
});

beforeEach(() => {
  mocks.groupBy.mockReset();
  mocks.logInfo.mockClear();
  mocks.sendTelegramAlert.mockClear();
  mocks.reportMessage.mockClear();
});

describe("evaluatePdAccessWindow — пороги 16.3", () => {
  it("ровно на пороге — не аномалия, на единицу больше — аномалия", () => {
    expect(evaluatePdAccessWindow([row("ADMIN", 1000), row("MASTER", 3000), row("STUDIO", 3000)])).toEqual([]);
    expect(evaluatePdAccessWindow([row("ADMIN", 1001)]).map((a) => a.reason)).toEqual(["rows"]);
    expect(evaluatePdAccessWindow([row("MASTER", 3001)]).map((a) => a.reason)).toEqual(["rows"]);
  });

  it("у админа — и по числу событий (≈20 страниц по 50)", () => {
    expect(evaluatePdAccessWindow([row("ADMIN", 10, 60)])).toEqual([]);
    expect(evaluatePdAccessWindow([row("ADMIN", 10, 61)]).map((a) => a.reason)).toEqual(["events"]);
    // у мастера порога по событиям нет
    expect(evaluatePdAccessWindow([row("MASTER", 10, 500)])).toEqual([]);
  });

  it("SYSTEM не оценивается", () => {
    expect(PD_ANOMALY_THRESHOLDS.SYSTEM).toBeNull();
    expect(evaluatePdAccessWindow([row("SYSTEM", 1_000_000, 1_000)])).toEqual([]);
  });
});

describe("detectPdAccessAnomalies", () => {
  it("режим наблюдения: превышение — только лог, без Telegram и GlitchTip", async () => {
    expect(PD_ANOMALY_ALERTS_ENABLED).toBe(false);
    mocks.groupBy.mockResolvedValueOnce([
      { actorUserId: "u1", actorType: "ADMIN", surface: "admin.users.list", _sum: { rowCount: 5000 }, _count: { _all: 3 } },
    ]);
    const anomalies = await detectPdAccessAnomalies(new Date("2026-09-29T12:00:00Z"));
    expect(anomalies).toHaveLength(1);
    expect(mocks.logInfo).toHaveBeenCalledWith("pd-access.anomaly.observed", expect.objectContaining({ lastLogId: "pdlog-last" }));
    expect(mocks.sendTelegramAlert).not.toHaveBeenCalled();
    expect(mocks.reportMessage).not.toHaveBeenCalled();
    // окно — последний час
    expect(mocks.groupBy.mock.calls[0][0].where.createdAt.gte.toISOString()).toBe("2026-09-29T11:00:00.000Z");
  });

  it("текст сигнала — без id человека и без IP", () => {
    const text = formatPdAnomalyAlert({ ...row("ADMIN", 5000), reason: "rows" }, "pdlog-1");
    expect(text).not.toContain("user-secret-id");
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text).toContain("pdlog-1");
    expect(text).toContain("ADMIN");
  });
});
