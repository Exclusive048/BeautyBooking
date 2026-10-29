import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import { parseDateKeyToUtcStart } from "@/lib/schedule/editor-shared";
import { ensureNamedWizardDayTx, repairNamedWizardDays } from "@/lib/schedule/patterns-core";

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29) — повторное применение «Каждый раз
 * по-разному» с другими часами переводит отмеченные дни на новые часы.
 *
 * Жалоба владельца: часы и перерыв поменяли в окне графика, а «Новая запись»
 * показывала окошки по-старому. Окно создавало новый «Рабочий день» палитры,
 * а дни календаря ссылались на прежний.
 *
 * @probe 2026-10-29: в `ensureNamedWizardDayTx` убран `scheduleOverride.updateMany`
 * — покраснел «новые часы — дни с начала графика переходят на новую версию»
 * (переводов дней не было).
 *
 * Пост-деплой `repairNamedWizardDays` чинит то, что прежний код уже оставил.
 * @probe 2026-10-29: в `repairNamedWizardDays` сравнение с сегодняшним днём
 * снято (`fromDateKey = period?.startsOn ?? todayKey`) — покраснел «график
 * начался в прошлом — переводятся дни с сегодня салона» (пришло 2026-10-01).
 */

type Row = {
  id: string;
  label: string | null;
  color: string | null;
  startLocal: string;
  endLocal: string;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotTimes: string[];
  breaks: Array<{ startLocal: string; endLocal: string; sortOrder: number; title: string | null }>;
};

const LABEL = "Рабочий день";

function makeTx(rows: Row[]) {
  const all = [...rows];
  const created: Array<Record<string, unknown>> = [];
  const overrideUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const templateUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const tx = {
    scheduleTemplate: {
      // Новейшие первыми — как `orderBy createdAt desc`.
      findMany: vi.fn(async (args: { where: { label?: string } }) =>
        all.filter((row) => row.label === args.where.label).reverse(),
      ),
      findUniqueOrThrow: vi.fn(async (args: { where: { id: string } }) => {
        const row = all.find((item) => item.id === args.where.id);
        if (!row) throw new Error("not found");
        return row;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        const id = `new-${created.length}`;
        all.push({
          id,
          label: data.label as string,
          color: (data.color as string | null) ?? null,
          startLocal: data.startLocal as string,
          endLocal: data.endLocal as string,
          scheduleMode: data.scheduleMode as Row["scheduleMode"],
          fixedSlotTimes: data.fixedSlotTimes as string[],
          breaks: [],
        });
        return { id };
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        templateUpdates.push(args);
        return { count: 1 };
      }),
    },
    scheduleOverride: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        overrideUpdates.push(args);
        return { count: 3 };
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, created, overrideUpdates, templateUpdates };
}

const row = (id: string, startLocal: string, color: string | null): Row => ({
  id,
  label: LABEL,
  color,
  startLocal,
  endLocal: "18:00",
  scheduleMode: "FLEXIBLE",
  fixedSlotTimes: [],
  breaks: [],
});

const def = (startTime: string, breaks: Array<{ start: string; end: string }> = []) => ({
  startTime,
  endTime: "18:00",
  breaks: breaks.map((item) => ({ ...item, title: null })),
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
  label: LABEL,
  color: null,
});

describe("«Рабочий день» окна графика при повторном применении", () => {
  it("новые часы — дни с начала графика переходят на новую версию, прежняя теряет имя", async () => {
    const { tx, created, overrideUpdates, templateUpdates } = makeTx([row("old", "06:00", "4")]);
    const id = await ensureNamedWizardDayTx(
      tx,
      "p1",
      def("06:30", [
        { start: "07:40", end: "07:50" },
        { start: "13:00", end: "14:00" },
      ]),
      "2026-10-29",
    );

    expect(id).toBe("new-1");
    // Цвет — прежнего «Рабочего дня»: для человека это тот же день.
    expect(created[0]?.color).toBe("4");
    expect(created[0]?.breaks).toEqual({
      create: [
        { startLocal: "07:40", endLocal: "07:50", sortOrder: 0, title: null },
        { startLocal: "13:00", endLocal: "14:00", sortOrder: 1, title: null },
      ],
    });

    expect(overrideUpdates).toEqual([
      {
        where: {
          providerId: "p1",
          kind: "TEMPLATE",
          templateId: { in: ["old"] },
          date: { gte: parseDateKeyToUtcStart("2026-10-29") },
        },
        data: { templateId: "new-1", startLocal: "06:30", endLocal: "18:00", scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
      },
    ]);
    expect(templateUpdates).toEqual([{ where: { id: { in: ["old"] } }, data: { label: null } }]);
  });

  it("те же часы — та же строка, ничего не переводится", async () => {
    const { tx, created, overrideUpdates, templateUpdates } = makeTx([row("old", "06:00", "4")]);
    expect(await ensureNamedWizardDayTx(tx, "p1", def("06:00"), "2026-10-29")).toBe("old");
    expect(created).toEqual([]);
    expect(overrideUpdates).toEqual([]);
    expect(templateUpdates).toEqual([]);
  });

  it("часы совпали с более старой версией — она снова текущая, новейшая уходит", async () => {
    const { tx, overrideUpdates } = makeTx([row("v1", "06:00", "4"), row("v2", "07:00", "4")]);
    expect(await ensureNamedWizardDayTx(tx, "p1", def("06:00"), "2026-10-29")).toBe("v1");
    expect(overrideUpdates[0]?.where.templateId).toEqual({ in: ["v2"] });
    expect(overrideUpdates[0]?.data.templateId).toBe("v1");
  });

  it("первый раз — новый день со свободным цветом палитры, без переводов", async () => {
    const { tx, created, overrideUpdates } = makeTx([]);
    const pickColor = vi.fn(async () => "3" as const);
    expect(await ensureNamedWizardDayTx(tx, "p1", def("09:00"), "2026-10-29", pickColor)).toBe("new-1");
    expect(created[0]?.color).toBe("3");
    expect(overrideUpdates).toEqual([]);
  });
});

type Version = { id: string; providerId: string; createdAt: Date };

function makeClient(input: {
  versions: Version[];
  periodStartsOn?: Record<string, string | null>;
  timezones?: Record<string, string>;
  failFor?: string;
}) {
  const overrideUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const unlabeled: string[][] = [];
  const cleaned: string[] = [];
  const transactions = vi.fn();
  const db = {
    scheduleTemplate: {
      findMany: vi.fn(async (args: { where: { providerId?: string } }) => {
        const rows = input.versions.filter((row) => !args.where.providerId || row.providerId === args.where.providerId);
        return [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      }),
      findUniqueOrThrow: vi.fn(async () => ({
        startLocal: "06:30",
        endLocal: "18:20",
        scheduleMode: "FLEXIBLE",
        fixedSlotTimes: [],
      })),
      updateMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
        unlabeled.push(args.where.id.in);
        return { count: args.where.id.in.length };
      }),
      deleteMany: vi.fn(async (args: { where: { providerId: string } }) => {
        cleaned.push(args.where.providerId);
        return { count: 1 };
      }),
    },
    provider: {
      findUniqueOrThrow: vi.fn(async (args: { where: { id: string } }) => {
        if (args.where.id === input.failFor) throw new Error("boom");
        return { timezone: input.timezones?.[args.where.id] ?? "Europe/Moscow" };
      }),
    },
    schedulePattern: {
      findFirst: vi.fn(async (args: { where: { providerId: string } }) => {
        const startsOn = input.periodStartsOn?.[args.where.providerId];
        return startsOn === undefined ? null : { startsOn };
      }),
    },
    scheduleOverride: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        overrideUpdates.push(args);
        return { count: 2 };
      }),
    },
  };
  const client = {
    ...db,
    $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => {
      transactions();
      return fn(db);
    },
  };
  return { client: client as unknown as PrismaClient, overrideUpdates, unlabeled, cleaned, transactions };
}

const OLD = new Date("2026-10-01T09:00:00Z");
const NEW = new Date("2026-10-20T09:00:00Z");
const NOW = new Date("2026-10-29T12:00:00Z");

describe("пост-деплой: «Рабочий день», оставленный прежним кодом в двух версиях", () => {
  it("дни с начала графика новейшей версии переходят на неё, прежняя теряет имя и уходит", async () => {
    const { client, overrideUpdates, unlabeled, cleaned } = makeClient({
      versions: [
        { id: "v1", providerId: "p1", createdAt: OLD },
        { id: "v2", providerId: "p1", createdAt: NEW },
      ],
      periodStartsOn: { p1: "2026-11-05" },
    });

    const result = await repairNamedWizardDays(client, LABEL, NOW);

    expect(result).toEqual({ repaired: 1, movedDays: 2, failed: [] });
    expect(overrideUpdates).toEqual([
      {
        where: {
          providerId: "p1",
          kind: "TEMPLATE",
          templateId: { in: ["v1"] },
          date: { gte: parseDateKeyToUtcStart("2026-11-05") },
        },
        data: { templateId: "v2", startLocal: "06:30", endLocal: "18:20", scheduleMode: "FLEXIBLE", fixedSlotTimes: [] },
      },
    ]);
    expect(unlabeled).toEqual([["v1"]]);
    expect(cleaned).toEqual(["p1"]);
  });

  it("график начался в прошлом — переводятся дни с сегодня салона, прошедшие не трогаются", async () => {
    const { client, overrideUpdates } = makeClient({
      versions: [
        { id: "v1", providerId: "p1", createdAt: OLD },
        { id: "v2", providerId: "p1", createdAt: NEW },
      ],
      periodStartsOn: { p1: "2026-10-01" },
      // 20:30 UTC — в Екатеринбурге уже 30-е.
      timezones: { p1: "Asia/Yekaterinburg" },
    });

    await repairNamedWizardDays(client, LABEL, new Date("2026-10-29T20:30:00Z"));

    expect(overrideUpdates[0]?.where.date).toEqual({ gte: parseDateKeyToUtcStart("2026-10-30") });
  });

  it("одна версия — профиль не трогается", async () => {
    const { client, transactions, overrideUpdates } = makeClient({
      versions: [{ id: "v1", providerId: "p1", createdAt: OLD }],
    });

    expect(await repairNamedWizardDays(client, LABEL, NOW)).toEqual({ repaired: 0, movedDays: 0, failed: [] });
    expect(transactions).not.toHaveBeenCalled();
    expect(overrideUpdates).toEqual([]);
  });

  it("сбой одного профиля не останавливает остальные", async () => {
    const { client, cleaned } = makeClient({
      versions: [
        { id: "a1", providerId: "bad", createdAt: OLD },
        { id: "a2", providerId: "bad", createdAt: NEW },
        { id: "b1", providerId: "good", createdAt: OLD },
        { id: "b2", providerId: "good", createdAt: NEW },
      ],
      failFor: "bad",
    });

    const result = await repairNamedWizardDays(client, LABEL, NOW);

    expect(result.repaired).toBe(1);
    expect(result.failed).toEqual([{ providerId: "bad", error: "boom" }]);
    expect(cleaned).toEqual(["good"]);
  });
});
