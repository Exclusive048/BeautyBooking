import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-08 — публичный виджет студии резолвил длительность услуги в цикле по
 * мастерам: `provider.findUnique` + `service.findUnique` (+ оверрайд) на
 * КАЖДОГО, причём `serviceId` у всех один и тот же, то есть один и тот же
 * запрос к `Service` повторялся M раз подряд. Для семи мастеров Vision это
 * 14–21 запрос до того, как начнётся расчёт слотов.
 *
 * Опасность пакетной версии — не в скорости, а в том, что правило («оверрайд
 * студийного мастера, иначе длительность услуги», плюс порядок отказов)
 * получит вторую реализацию и разойдётся с первой. Поэтому обе формы сидят на
 * одной чистой функции, и тест сверяет их ОТВЕТ НА ОДИН И ТОТ ЖЕ ВХОД, а не
 * проверяет каждую по отдельности.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const providerFindMany = vi.hoisted(() => vi.fn());
const serviceFindUnique = vi.hoisted(() => vi.fn());
const masterServiceFindUnique = vi.hoisted(() => vi.fn());
const masterServiceFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique, findMany: providerFindMany },
    service: { findUnique: serviceFindUnique },
    masterService: { findUnique: masterServiceFindUnique, findMany: masterServiceFindMany },
  },
}));

import { resolveServiceDuration, resolveServiceDurations } from "@/lib/schedule/resolveDuration";

const SERVICE_ID = "svc_1";
const STUDIO_ID = "studio_1";

const SOLO = { id: "solo_1", type: "MASTER" as const, studioId: null };
const IN_STUDIO = { id: "studio_master_1", type: "MASTER" as const, studioId: STUDIO_ID };
const NOT_A_MASTER = { id: "studio_provider_1", type: "STUDIO" as const, studioId: null };

const STUDIO_SERVICE = {
  id: SERVICE_ID,
  providerId: STUDIO_ID,
  durationMin: 60,
  isEnabled: true,
  isActive: true,
};

/** Тот же вход двум формам резолвера — ответ обязан совпасть. */
async function bothForms(input: {
  master: unknown;
  service: unknown;
  override: unknown;
  masterId: string;
}) {
  vi.clearAllMocks();
  providerFindUnique.mockResolvedValue(input.master);
  serviceFindUnique.mockResolvedValue(input.service);
  masterServiceFindUnique.mockResolvedValue(input.override);
  const single = await resolveServiceDuration(input.masterId, SERVICE_ID);

  vi.clearAllMocks();
  providerFindMany.mockResolvedValue(input.master ? [input.master] : []);
  serviceFindUnique.mockResolvedValue(input.service);
  masterServiceFindMany.mockResolvedValue(
    input.override ? [{ masterProviderId: input.masterId, ...(input.override as object) }] : []
  );
  const batch = (await resolveServiceDurations([input.masterId], SERVICE_ID)).get(input.masterId);

  return { single, batch };
}

describe("PERF-08 · пакетный резолвер длительности отвечает как поштучный", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("студийный мастер с оверрайдом", async () => {
    const { single, batch } = await bothForms({
      masterId: IN_STUDIO.id,
      master: IN_STUDIO,
      service: STUDIO_SERVICE,
      override: { durationOverrideMin: 90, isEnabled: true },
    });
    expect(single).toEqual({ ok: true, data: 90 });
    expect(batch).toEqual(single);
  });

  it("студийный мастер без оверрайда длительности — берёт длительность услуги", async () => {
    const { single, batch } = await bothForms({
      masterId: IN_STUDIO.id,
      master: IN_STUDIO,
      service: STUDIO_SERVICE,
      override: { durationOverrideMin: null, isEnabled: true },
    });
    expect(single).toEqual({ ok: true, data: 60 });
    expect(batch).toEqual(single);
  });

  it("услуга не назначена мастеру — 409 SERVICE_INVALID", async () => {
    const { single, batch } = await bothForms({
      masterId: IN_STUDIO.id,
      master: IN_STUDIO,
      service: STUDIO_SERVICE,
      override: null,
    });
    expect(single).toMatchObject({ ok: false, status: 409, code: "SERVICE_INVALID" });
    expect(batch).toEqual(single);
  });

  it("назначение выключено — тот же отказ, что и при отсутствии", async () => {
    const { single, batch } = await bothForms({
      masterId: IN_STUDIO.id,
      master: IN_STUDIO,
      service: STUDIO_SERVICE,
      override: { durationOverrideMin: 90, isEnabled: false },
    });
    expect(single).toMatchObject({ ok: false, status: 409, code: "SERVICE_INVALID" });
    expect(batch).toEqual(single);
  });

  it("соло-мастер и его собственная услуга", async () => {
    const { single, batch } = await bothForms({
      masterId: SOLO.id,
      master: SOLO,
      service: { ...STUDIO_SERVICE, providerId: SOLO.id },
      override: null,
    });
    expect(single).toEqual({ ok: true, data: 60 });
    expect(batch).toEqual(single);
  });

  it("чужая услуга у соло-мастера — 400 SERVICE_INVALID", async () => {
    const { single, batch } = await bothForms({
      masterId: SOLO.id,
      master: SOLO,
      service: { ...STUDIO_SERVICE, providerId: "someone_else" },
      override: null,
    });
    expect(single).toMatchObject({ ok: false, status: 400, code: "SERVICE_INVALID" });
    expect(batch).toEqual(single);
  });

  it("услуга выключена — 409 SERVICE_DISABLED раньше проверки принадлежности", async () => {
    const { single, batch } = await bothForms({
      masterId: IN_STUDIO.id,
      master: IN_STUDIO,
      service: { ...STUDIO_SERVICE, isEnabled: false },
      override: { durationOverrideMin: 90, isEnabled: true },
    });
    expect(single).toMatchObject({ ok: false, status: 409, code: "SERVICE_DISABLED" });
    expect(batch).toEqual(single);
  });

  it("нет мастера — MASTER_NOT_FOUND, и он важнее отсутствующей услуги", async () => {
    const { single, batch } = await bothForms({
      masterId: "ghost",
      master: null,
      service: null,
      override: null,
    });
    expect(single).toMatchObject({ ok: false, status: 404, code: "MASTER_NOT_FOUND" });
    expect(batch).toEqual(single);
  });

  it("провайдер не мастер — тот же MASTER_NOT_FOUND", async () => {
    const { single, batch } = await bothForms({
      masterId: NOT_A_MASTER.id,
      master: NOT_A_MASTER,
      service: STUDIO_SERVICE,
      override: null,
    });
    expect(single).toMatchObject({ ok: false, status: 404, code: "MASTER_NOT_FOUND" });
    expect(batch).toEqual(single);
  });

  it("нет услуги — SERVICE_NOT_FOUND", async () => {
    const { single, batch } = await bothForms({
      masterId: SOLO.id,
      master: SOLO,
      service: null,
      override: null,
    });
    expect(single).toMatchObject({ ok: false, status: 404, code: "SERVICE_NOT_FOUND" });
    expect(batch).toEqual(single);
  });
});

describe("PERF-08 · стоимость пакета не растёт с числом мастеров", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("двенадцать мастеров — три запроса, а не тридцать шесть", async () => {
    const masterIds = Array.from({ length: 12 }, (_, i) => `m_${i}`);
    providerFindMany.mockResolvedValue(
      masterIds.map((id) => ({ id, type: "MASTER" as const, studioId: STUDIO_ID }))
    );
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    masterServiceFindMany.mockResolvedValue(
      masterIds.map((id) => ({ masterProviderId: id, durationOverrideMin: null, isEnabled: true }))
    );

    const result = await resolveServiceDurations(masterIds, SERVICE_ID);

    expect(result.size).toBe(12);
    expect([...result.values()].every((r) => r.ok && r.data === 60)).toBe(true);
    expect(providerFindMany).toHaveBeenCalledTimes(1);
    expect(serviceFindUnique).toHaveBeenCalledTimes(1);
    expect(masterServiceFindMany).toHaveBeenCalledTimes(1);
    // Поштучные читалки не должны вызываться вовсе.
    expect(providerFindUnique).not.toHaveBeenCalled();
    expect(masterServiceFindUnique).not.toHaveBeenCalled();
  });

  it("пустой набор не ходит в БД вообще", async () => {
    const result = await resolveServiceDurations([], SERVICE_ID);
    expect(result.size).toBe(0);
    expect(providerFindMany).not.toHaveBeenCalled();
    expect(serviceFindUnique).not.toHaveBeenCalled();
  });
});
