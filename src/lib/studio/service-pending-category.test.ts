import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryStatus } from "@prisma/client";

/**
 * STUDIO-SERVICE-PENDING-CATEGORY-01 — правка услуги студии принимает ту же
 * категорию, что и создание: одобренную ИЛИ свою, ещё на модерации. Форма
 * карточки услуги шлёт категорию при КАЖДОМ сохранении, поэтому строгое
 * «только одобренная» роняло любую правку услуги с категорией на модерации
 * («Глобальная категория не найдена» при назначении мастера).
 *
 * @probe 2026-09-23 — в `updateStudioService` возвращено прежнее правило
 * (`status !== APPROVED` → отказ, без исключения для неизменённой категории):
 * красные «неизменённая категория на модерации» и «своя новая на модерации».
 * Возвращено — зелёный.
 */

const serviceFindUnique = vi.hoisted(() => vi.fn());
const globalCategoryFindUnique = vi.hoisted(() => vi.fn());
const txServiceUpdate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: { findUnique: serviceFindUnique },
    globalCategory: { findUnique: globalCategoryFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        service: { update: txServiceUpdate },
        globalCategory: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})) },
      }),
  },
}));
vi.mock("@/lib/studio/master-eligibility", () => ({ requireActiveStudioMaster: vi.fn() }));
vi.mock("@/lib/studio/tenancy", () => ({ assertBelongsToStudio: vi.fn() }));

import { updateStudioService } from "@/lib/studio/services.service";

const STUDIO = "studio-1";
const OWNER = "owner-user";

function pending(by: string) {
  return { id: "cat-pending", status: CategoryStatus.PENDING, visualSearchSlug: null, proposedBy: by, createdByUserId: by };
}

beforeEach(() => {
  serviceFindUnique.mockReset();
  globalCategoryFindUnique.mockReset();
  txServiceUpdate.mockClear();
});

describe("updateStudioService · категория на модерации", () => {
  it("неизменённая категория на модерации — правка проходит, категория не перепроверяется", async () => {
    serviceFindUnique.mockResolvedValue({ id: "svc", studioId: STUDIO, globalCategoryId: "cat-pending" });
    await expect(
      updateStudioService({ studioId: STUDIO, serviceId: "svc", globalCategoryId: "cat-pending", title: "Стрижка", proposerUserId: OWNER }),
    ).resolves.toEqual({ id: "svc" });
    expect(globalCategoryFindUnique).not.toHaveBeenCalled();
  });

  it("своя новая категория на модерации — принимается", async () => {
    serviceFindUnique.mockResolvedValue({ id: "svc", studioId: STUDIO, globalCategoryId: null });
    globalCategoryFindUnique.mockResolvedValue(pending(OWNER));
    await expect(
      updateStudioService({ studioId: STUDIO, serviceId: "svc", globalCategoryId: "cat-pending", proposerUserId: OWNER }),
    ).resolves.toEqual({ id: "svc" });
  });

  it("чужая категория на модерации — отказ", async () => {
    serviceFindUnique.mockResolvedValue({ id: "svc", studioId: STUDIO, globalCategoryId: null });
    globalCategoryFindUnique.mockResolvedValue(pending("someone-else"));
    await expect(
      updateStudioService({ studioId: STUDIO, serviceId: "svc", globalCategoryId: "cat-pending", proposerUserId: OWNER }),
    ).rejects.toMatchObject({ status: 404 });
    expect(txServiceUpdate).not.toHaveBeenCalled();
  });

  it("одобренная категория — принимается", async () => {
    serviceFindUnique.mockResolvedValue({ id: "svc", studioId: STUDIO, globalCategoryId: null });
    globalCategoryFindUnique.mockResolvedValue({ ...pending("x"), status: CategoryStatus.APPROVED });
    await expect(
      updateStudioService({ studioId: STUDIO, serviceId: "svc", globalCategoryId: "cat-pending", proposerUserId: OWNER }),
    ).resolves.toEqual({ id: "svc" });
  });
});
