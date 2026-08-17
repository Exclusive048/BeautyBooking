import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RES-26 — пропущенный день снимка MRR.
 *
 * Снимок держался на ОДНОМ внешнем срабатывании cron'а в сутки. Не сработало —
 * в ряду навсегда дыра, и увидят её ровно через 30 дней, когда
 * `getMrrSnapshotDaysAgo` не найдёт строку на точную дату и KPI покажет «—».
 *
 * Подбор — это второй шанс ИЗМЕРИТЬ сегодняшний день, а НЕ бэкфилл прошедших:
 * `UserSubscription` хранит границы периода одним изменяемым полем (продление
 * перезаписывает), `status` — текущий, поэтому набор «кто был оплачен на дату D»
 * из БД не восстанавливается. Занижённая точка в денежном ряду хуже пропуска —
 * пропуск виден как «—», занижение читается как падение выручки, которого не
 * было. Оба свойства пиннятся ниже: ранний выход до окна и запись строго на
 * сегодняшнюю дату.
 */

const snapshotFindUnique = vi.hoisted(() => vi.fn());
const snapshotCreate = vi.hoisted(() => vi.fn());
const subFindMany = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mrrSnapshot: { findUnique: snapshotFindUnique, create: snapshotCreate },
    userSubscription: { findMany: subFindMany },
  },
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo }));

import {
  MRR_SNAPSHOT_BACKSTOP_HOUR_UTC,
  runMrrSnapshotBackstop,
} from "@/lib/billing/mrr-snapshot";

const DAY = "2026-05-13";

beforeEach(() => {
  vi.useFakeTimers();
  snapshotFindUnique.mockReset();
  snapshotCreate.mockReset();
  subFindMany.mockReset();
  logInfo.mockReset();
  subFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runMrrSnapshotBackstop (RES-26)", () => {
  it("до позднего часа UTC не ходит в БД вовсе — внешний cron остаётся первичным", async () => {
    vi.setSystemTime(new Date(`${DAY}T10:30:00Z`));

    const result = await runMrrSnapshotBackstop();

    expect(result).toEqual({ ran: false, reason: "too-early" });
    expect(snapshotFindUnique).not.toHaveBeenCalled();
    expect(snapshotCreate).not.toHaveBeenCalled();
  });

  it("в окне при уже существующей строке ничего не пишет", async () => {
    vi.setSystemTime(new Date(`${DAY}T23:10:00Z`));
    snapshotFindUnique.mockResolvedValue({
      snapshotDate: new Date(`${DAY}T00:00:00Z`),
      mrrKopeks: BigInt(500_000),
      activeSubscriptionsCount: 4,
    });

    const result = await runMrrSnapshotBackstop();

    expect(result).toMatchObject({ ran: true, created: false });
    expect(snapshotCreate).not.toHaveBeenCalled();
  });

  it("в окне при отсутствующей строке измеряет и пишет — на СЕГОДНЯШНЮЮ дату", async () => {
    vi.setSystemTime(new Date(`${DAY}T23:45:00Z`));
    snapshotFindUnique.mockResolvedValue(null);
    snapshotCreate.mockImplementation(({ data }: { data: { snapshotDate: Date } }) => ({
      snapshotDate: data.snapshotDate,
      mrrKopeks: BigInt(0),
      activeSubscriptionsCount: 0,
    }));

    const result = await runMrrSnapshotBackstop();

    expect(result).toMatchObject({ ran: true, created: true });
    expect(snapshotCreate).toHaveBeenCalledTimes(1);

    const written = snapshotCreate.mock.calls[0][0].data.snapshotDate as Date;
    // ровно полночь UTC сегодняшнего дня — не вчерашнего и не «ближайшего пустого»
    expect(written.toISOString()).toBe(`${DAY}T00:00:00.000Z`);
  });

  it("час подбора лежит внутри UTC-суток, к которым относится строка", () => {
    expect(MRR_SNAPSHOT_BACKSTOP_HOUR_UTC).toBeGreaterThanOrEqual(20);
    expect(MRR_SNAPSHOT_BACKSTOP_HOUR_UTC).toBeLessThanOrEqual(23);
  });

  it("другой даты, кроме сегодняшней, подбор не принимает — параметра для этого нет", async () => {
    // сигнатура допускает только «сейчас»: подставить произвольный день, чтобы
    // дописать пропущенный, невозможно by construction — дата строки выводится
    // внутри `createMrrSnapshotForToday` из того же `now`
    vi.setSystemTime(new Date(`${DAY}T23:05:00Z`));
    snapshotFindUnique.mockResolvedValue(null);
    snapshotCreate.mockImplementation(({ data }: { data: { snapshotDate: Date } }) => ({
      snapshotDate: data.snapshotDate,
      mrrKopeks: BigInt(0),
      activeSubscriptionsCount: 0,
    }));

    // даже если вызвать с датой прошедшего дня, писаться будет сегодняшняя
    await runMrrSnapshotBackstop(new Date("2026-05-01T23:30:00Z"));

    const written = snapshotCreate.mock.calls[0][0].data.snapshotDate as Date;
    expect(written.toISOString()).toBe(`${DAY}T00:00:00.000Z`);
  });
});
