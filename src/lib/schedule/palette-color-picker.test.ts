import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ensureAutoTemplateTx,
  ensurePaletteTemplateTx,
  paletteColorPickerTx,
} from "@/lib/schedule/patterns-core";

/**
 * Решение владельца 2026-10-14: «новый режим, созданный в расписании, — новым
 * цветом». Рабочий день, который создают окно графика и неделя, получает
 * свободный цвет палитры мастера; раньше он рождался без цвета (а «Каждый раз
 * по-разному» — всегда с «1») и брал цвет по номеру в палитре — то есть
 * совпадал с соседом, которому цвет выбрали вручную.
 *
 * @probe 2026-10-14: в `paletteColorPickerTx` убран `taken.push(color)` —
 * красное: два новых дня одного окна получили один цвет «3».
 * @probe 2026-10-14: `ensureAutoTemplateTx` пишет `color: null` (как до
 * правки) — красное: у созданного дня цвета нет.
 */

type TemplateRow = {
  id: string;
  label: string | null;
  color: string | null;
  _count: { patternDays: number; weeklyScheduleDays: number; scheduleOverrides: number };
};

function makeTx(options: {
  templates: TemplateRow[];
  scheduledIds: string[];
  existingAutoId?: string;
}) {
  const created: Array<Record<string, unknown>> = [];
  // Поиск дня палитры с тем же именем (`ensurePaletteTemplateTx`) — пусто:
  // в этих случаях день всегда новый.
  const findMany = vi.fn(async (args: { where: { label?: string } }) =>
    args.where.label !== undefined ? [] : options.templates,
  );
  const tx = {
    schedulePattern: {
      findMany: vi.fn(async () =>
        options.scheduledIds.length > 0
          ? [{ days: options.scheduledIds.map((templateId) => ({ templateId })) }]
          : [],
      ),
      count: vi.fn(async () => 0),
    },
    weeklyScheduleConfig: { count: vi.fn(async () => 0) },
    scheduleTemplate: {
      findMany,
      findUnique: vi.fn(async () => (options.existingAutoId ? { id: options.existingAutoId } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `new-${created.length}` };
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, created, findMany };
}

const counts = (patternDays: number) => ({ patternDays, weeklyScheduleDays: 0, scheduleOverrides: 0 });

const DAY = (startTime: string) => ({
  startTime,
  endTime: "18:00",
  breaks: [],
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
});

describe("цвет нового рабочего дня", () => {
  it("свободный цвет в обход сохранённых и выданных по порядку; два новых дня — разные", async () => {
    // «Утро» — цвет «1» выбран вручную; день без цвета в графике получает «2».
    const { tx, created } = makeTx({
      templates: [
        { id: "auto", label: null, color: null, _count: counts(3) },
        { id: "morning", label: "Утро", color: "1", _count: counts(0) },
      ],
      scheduledIds: ["auto"],
    });
    const pick = paletteColorPickerTx(tx, "m1", "2026-10-14");
    await ensureAutoTemplateTx(tx, "m1", DAY("09:00"), pick);
    await ensureAutoTemplateTx(tx, "m1", DAY("12:00"), pick);
    expect(created.map((row) => row.color)).toEqual(["3", "4"]);
  });

  it("день вне палитры (график кончился, имени нет) цвет не держит", async () => {
    const { tx, created } = makeTx({
      templates: [{ id: "old", label: null, color: "1", _count: counts(0) }],
      scheduledIds: [],
    });
    await ensureAutoTemplateTx(tx, "m1", DAY("09:00"), paletteColorPickerTx(tx, "m1", "2026-10-14"));
    expect(created[0]!.color).toBe("1");
  });

  it("найденный по подписи день цвет не запрашивает — палитра даже не читается", async () => {
    const { tx, created, findMany } = makeTx({ templates: [], scheduledIds: [], existingAutoId: "same" });
    const id = await ensureAutoTemplateTx(tx, "m1", DAY("09:00"), paletteColorPickerTx(tx, "m1", "2026-10-14"));
    expect(id).toBe("same");
    expect(created).toHaveLength(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("«Каждый раз по-разному»: день с именем без цвета — свободный; названный цвет — как есть", async () => {
    const { tx, created } = makeTx({
      templates: [{ id: "auto", label: null, color: null, _count: counts(2) }],
      scheduledIds: ["auto"],
    });
    const pick = paletteColorPickerTx(tx, "m1", "2026-10-14");
    await ensurePaletteTemplateTx(tx, "m1", { ...DAY("10:00"), label: "Рабочий день", color: null }, pick);
    await ensurePaletteTemplateTx(tx, "m1", { ...DAY("11:00"), label: "Вечер", color: "5" }, pick);
    expect(created.map((row) => row.color)).toEqual(["2", "5"]);
  });
});
