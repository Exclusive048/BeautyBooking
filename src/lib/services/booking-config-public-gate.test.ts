import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * SEC-11 — публичная конфигурация записи не отдаётся для неопубликованного
 * кабинета и для выключенной услуги.
 *
 * `getPublicServiceBookingConfig` звал `loadServiceConfig`, то есть
 * `service.findUnique` по id БЕЗ единого условия — тогда как мастерский
 * близнец на том же загрузчике авторизует вызывающего. Любой CUID услуги
 * отдавал анониму авторские тексты вопросов к записи, включая услуги
 * черновых и приостановленных кабинетов.
 *
 * Тест проверяет и вторую половину: гейт стоит на видимости, а не на
 * существовании — легитимная опубликованная услуга по-прежнему отдаётся,
 * иначе публичный booking-флоу сломался бы целиком.
 */

const state = vi.hoisted(() => ({ visible: null as { id: string } | null }));

const spies = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: {
      findFirst: (args: unknown) => {
        spies.findFirst(args);
        return Promise.resolve(state.visible);
      },
      findUnique: (args: unknown) => {
        spies.findUnique(args);
        return Promise.resolve({
          requiresReferencePhoto: true,
          bookingQuestions: [{ id: "q1", text: "Длина ногтей?", required: true, order: 1 }],
        });
      },
    },
  },
}));

vi.mock("@/lib/studio/access", () => ({ ensureStudioRole: vi.fn() }));

import { AppError } from "@/lib/api/errors";
import { getPublicServiceBookingConfig } from "@/lib/services/booking-config";

beforeEach(() => {
  state.visible = null;
  spies.findFirst.mockClear();
  spies.findUnique.mockClear();
});

describe("SEC-11 · публичная конфигурация записи гейтится публикацией", () => {
  it("невидимая услуга → 404 и тексты вопросов НЕ читаются", async () => {
    await expect(getPublicServiceBookingConfig("svc1")).rejects.toBeInstanceOf(AppError);
    expect(spies.findUnique).not.toHaveBeenCalled();
  });

  it("код ошибки тот же, что у несуществующей услуги — существование не разглашается", async () => {
    const error = await getPublicServiceBookingConfig("svc1").catch((e: unknown) => e as AppError);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("SERVICE_NOT_FOUND");
    expect((error as AppError).status).toBe(404);
  });

  it("гейт спрашивает и публикацию кабинета, и активность услуги", async () => {
    state.visible = { id: "svc1" };
    await getPublicServiceBookingConfig("svc1");
    expect(spies.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "svc1",
          isActive: true,
          provider: { isPublished: true },
        }),
      }),
    );
  });

  it("видимая услуга по-прежнему отдаёт анкету (публичный флоу цел)", async () => {
    state.visible = { id: "svc1" };
    const config = await getPublicServiceBookingConfig("svc1");
    expect(config.requiresReferencePhoto).toBe(true);
    expect(config.questions).toHaveLength(1);
    expect(config.questions[0].text).toBe("Длина ногтей?");
  });
});
