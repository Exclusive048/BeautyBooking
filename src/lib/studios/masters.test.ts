import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-27 — `attachMasterToStudio` держал форму, которую `lib/studio/tenancy.ts`
 * прямо называет багом: `if (master.studioId && master.studioId !== studioId)`.
 * При `studioId === null` условие ложно, и ветка «перепривязать» была общей для
 * свободного мастера и для мастера, которого никто не спрашивал. Безопасность
 * держалась на том, что у примитива ровно один вызывающий (приём приглашения) и
 * он передаёт собственный provider принимающего — инвариант уровня ревью.
 *
 * Тесты фиксируют и новое правило (оно в `where`), и то, что ответы флоу приёма
 * приглашения не изменились: «мастера нет» — 404, «мастер занят» — 409.
 */

const { findUnique, findFirst, count, updateMany, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findUnique, findFirst, count, updateMany, update } },
}));

import { ProviderType } from "@prisma/client";
import { attachMasterToStudio } from "@/lib/studios/masters";

const STUDIO_ID = "studio-1";
const MASTER_ID = "master-1";

beforeEach(() => {
  vi.clearAllMocks();
  // ensureStudio
  findUnique.mockResolvedValue({
    id: STUDIO_ID,
    type: ProviderType.STUDIO,
    timezone: "Asia/Yekaterinburg",
  });
});

describe("attachMasterToStudio — SEC-27", () => {
  it("спрашивает БД о мастере БЕЗ студии или уже в этой же — правило в `where`", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null });
    updateMany.mockResolvedValue({ count: 1 });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: MASTER_ID,
          type: ProviderType.MASTER,
          OR: [{ studioId: null }, { studioId: STUDIO_ID }],
        },
      }),
    );
  });

  it("привязывает свободного мастера — путь приёма приглашения цел", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null });
    updateMany.mockResolvedValue({ count: 1 });

    const result = await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(result).toEqual({
      ok: true,
      data: { id: MASTER_ID, name: "Аня", studioId: STUDIO_ID },
    });
  });

  it("идемпотентен для мастера, уже состоящего в ЭТОЙ студии — без записи", async () => {
    findFirst.mockResolvedValue({
      id: MASTER_ID,
      name: "Аня",
      studioId: STUDIO_ID,
      timezone: "Asia/Yekaterinburg",
    });

    const result = await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(result.ok).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("отдаёт 409 мастеру, занятому ДРУГОЙ студией — текст ответа не изменился", async () => {
    findFirst.mockResolvedValue(null);
    count.mockResolvedValue(1);

    const result = await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ALREADY_ASSIGNED" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("отдаёт 404, когда мастера нет вовсе — 404 и 409 не схлопнуты", async () => {
    findFirst.mockResolvedValue(null);
    count.mockResolvedValue(0);

    const result = await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(result).toMatchObject({ ok: false, status: 404, code: "MASTER_NOT_FOUND" });
  });

  it("проигранная гонка кончается отказом, а не тихой перепривязкой", async () => {
    // между чтением и записью мастера приняла другая студия: строка уже не
    // подходит под `studioId: null`, и `updateMany` не задевает ни одной
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null });
    updateMany.mockResolvedValue({ count: 0 });

    const result = await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(result).toMatchObject({ ok: false, status: 409, code: "MASTER_ALREADY_ASSIGNED" });
  });

  it("повторяет состояние в `where` записи, а не пишет по одному id", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null });
    updateMany.mockResolvedValue({ count: 1 });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: MASTER_ID, type: ProviderType.MASTER, studioId: null },
      data: { studioId: STUDIO_ID, timezone: "Asia/Yekaterinburg", studioPaused: false },
    });
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * STUDIO-MASTER-TZ-01 — мастер студии живёт в её часовом поясе.
 *
 * Приглашённый мастер создавался с поясом по умолчанию (Москва) и таким
 * оставался: у екатеринбургской студии проверка рабочих часов при создании и
 * переносе записи и публичные слоты мастера съезжали на 2 часа.
 *
 * @probe 2026-09-22 — в ветке «уже в этой студии» убрана синхронизация пояса:
 * красным стал «приём приглашения выравнивает пояс мастера с поясом студии»
 * (`update` не вызван). Возвращена — зелёный.
 */
describe("attachMasterToStudio — STUDIO-MASTER-TZ-01", () => {
  it("приём приглашения выравнивает пояс мастера с поясом студии", async () => {
    // staged-профиль приглашённого мастера уже несёт `studioId` этой студии
    findFirst.mockResolvedValue({
      id: MASTER_ID,
      name: "Аня",
      studioId: STUDIO_ID,
      timezone: "Europe/Moscow",
    });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(update).toHaveBeenCalledWith({
      where: { id: MASTER_ID },
      data: { timezone: "Asia/Yekaterinburg" },
      select: { id: true },
    });
  });
});

/**
 * VISIBILITY-DEFAULT-01 — мастер без своего города получает город и адрес
 * студии: в каталоге находят по городу, а приглашённый мастер рождается без
 * адреса и иначе не находился нигде.
 *
 * @probe 2026-09-23 — `inheritStudioLocation` возвращал `{}` всегда: красные
 * «привязка ставит мастеру без города…» и «приём приглашения ставит…».
 * Возвращено — зелёный.
 */
describe("attachMasterToStudio — город студии мастеру без своего", () => {
  const LOCATION = {
    cityId: "city-ekb",
    address: "Екатеринбург, ул. Ленина, 1",
    district: "Центр",
    geoLat: 56.83,
    geoLng: 60.6,
  };

  beforeEach(() => {
    findUnique.mockResolvedValue({
      id: STUDIO_ID,
      type: ProviderType.STUDIO,
      timezone: "Asia/Yekaterinburg",
      ...LOCATION,
    });
  });

  it("привязка ставит мастеру без города город и адрес студии", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null, timezone: "Asia/Yekaterinburg", cityId: null });
    updateMany.mockResolvedValue({ count: 1 });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: MASTER_ID, type: ProviderType.MASTER, studioId: null },
      data: { studioId: STUDIO_ID, timezone: "Asia/Yekaterinburg", studioPaused: false, ...LOCATION },
    });
  });

  it("свой город мастера не перезаписывается", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: null, timezone: "Asia/Yekaterinburg", cityId: "city-own" });
    updateMany.mockResolvedValue({ count: 1 });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: MASTER_ID, type: ProviderType.MASTER, studioId: null },
      data: { studioId: STUDIO_ID, timezone: "Asia/Yekaterinburg", studioPaused: false },
    });
  });

  it("приём приглашения (заготовка уже в студии) ставит город студии", async () => {
    findFirst.mockResolvedValue({ id: MASTER_ID, name: "Аня", studioId: STUDIO_ID, timezone: "Asia/Yekaterinburg", cityId: null });

    await attachMasterToStudio(STUDIO_ID, MASTER_ID);

    expect(update).toHaveBeenCalledWith({ where: { id: MASTER_ID }, data: LOCATION, select: { id: true } });
  });
});
