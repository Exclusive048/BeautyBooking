import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEO-ADMIN-01: сохранение «SEO главной страницы». Текст уходит на главную
 * сайта, поэтому пределы выдачи и проверка слов — на сервере, а после
 * сохранения сбрасывается кэш, через который его читают главная и разметка.
 *
 * @probe 2026-10-12 — (1) в схеме снят `.max(max)`: красные оба «длиннее
 *   предела — 400 и ничего не пишется» (`expected 200 to be 400`);
 *   (2) вызов `invalidateSiteSeoCache()` закомментирован: красные «сохраняет
 *   текст… и сбрасывает кэш сайта» и «пустое поле — настройка удаляется».
 *   Возвращено — 5/5 зелёные.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn());
const createAdminAuditLog = vi.hoisted(() => vi.fn());
const invalidateSiteSeoCache = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/prisma", () => {
  const appSetting = { findMany, upsert, deleteMany };
  return {
    prisma: {
      appSetting,
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ appSetting }),
    },
  };
});
vi.mock("@/lib/audit/admin-audit", () => ({ createAdminAuditLog }));
vi.mock("@/lib/audit/admin-audit-context", () => ({ getAdminAuditContext: () => ({}) }));
vi.mock("@/lib/seo/site-seo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/seo/site-seo")>()),
  invalidateSiteSeoCache,
}));

import { PATCH } from "./route";
import { SITE_SEO_DESCRIPTION_MAX, SITE_SEO_TITLE_MAX } from "@/lib/seo/site-seo-shared";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAuth.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  findMany.mockResolvedValue([]);
});

describe("PATCH /api/admin/settings — SEO главной", () => {
  it("сохраняет текст с брендом, схлопнув пробелы, и сбрасывает кэш сайта", async () => {
    const res = await patch({
      seoTitle: "  МастерРядом —   онлайн-запись  ",
      seoDescription: "Запись к мастерам\nкрасоты рядом с вами.",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      seoTitle: "МастерРядом — онлайн-запись",
      seoDescription: "Запись к мастерам красоты рядом с вами.",
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(createAdminAuditLog).toHaveBeenCalledTimes(1);
    expect(invalidateSiteSeoCache).toHaveBeenCalledTimes(1);
  });

  it("пустое поле — настройка удаляется (на сайте текст из кода)", async () => {
    findMany.mockResolvedValue([{ key: "siteSeoTitle", value: "Старый заголовок" }]);
    const res = await patch({ seoTitle: "   ", seoDescription: null });
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(invalidateSiteSeoCache).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["seoTitle", SITE_SEO_TITLE_MAX],
    ["seoDescription", SITE_SEO_DESCRIPTION_MAX],
  ])("%s длиннее предела — 400 и ничего не пишется", async (field, max) => {
    const res = await patch({ [field]: "а".repeat(max + 1) });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(invalidateSiteSeoCache).not.toHaveBeenCalled();
  });

  it("запрещённые слова — 422, как у любого публичного поля", async () => {
    const res = await patch({ seoTitle: "МастерРядом — пиздец как удобно" });
    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });
});
