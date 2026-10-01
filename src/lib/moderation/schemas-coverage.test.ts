import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { formatZodError } from "@/lib/api/validation";
import { AppError } from "@/lib/api/errors";
import { findForbiddenWordsIssue } from "@/lib/moderation/zod";
import { parseBody } from "@/lib/validation";
import {
  createMasterPackageSchema,
  createMasterPortfolioSchema,
  createMasterServiceSchema,
  updateMasterProfileSchema,
  updateMasterServiceSchema,
} from "@/lib/master/schemas";
import {
  createStudioCategorySchema,
  createStudioServiceSchema,
  updateStudioMasterSchema,
} from "@/lib/studio/schemas";
import { createReviewSchema, reviewReplySchema } from "@/lib/reviews/schemas";
import { applyModelOfferSchema } from "@/lib/model-offers/schemas";
import { profileUpdateSchema } from "@/lib/users/schemas";
import { validateUsername } from "@/lib/publicUsername";

/**
 * FORBIDDEN-WORDS-01 — публичные поля схем отказывают на запрещённых словах, а
 * отказ доходит до человека понятной строкой и своим кодом.
 *
 * @probe 2026-10-01 — снять `.superRefine(rejectForbiddenWords…)` с `title` в
 *        `createMasterServiceSchema` → красный «услуга мастера: название».
 */

const BAD = "Маникюр хуй";

const cases: [string, z.ZodType, Record<string, unknown>][] = [
  ["профиль мастера: имя", updateMasterProfileSchema, { displayName: BAD }],
  ["профиль мастера: о себе", updateMasterProfileSchema, { bio: BAD }],
  ["услуга мастера: название", createMasterServiceSchema, { title: BAD, price: 0, durationMin: 30 }],
  ["услуга мастера: описание (правка)", updateMasterServiceSchema, { description: BAD }],
  ["пакет мастера", createMasterPackageSchema, { name: BAD, serviceIds: ["a", "b"], discountType: "PERCENT", discountValue: 1 }],
  ["подпись к работе", createMasterPortfolioSchema, { mediaUrl: "https://x.ru/a.jpg", caption: BAD, serviceIds: [] }],
  ["категория студии", createStudioCategorySchema, { title: BAD }],
  ["услуга студии", createStudioServiceSchema, { title: BAD }],
  ["мастер студии", updateStudioMasterSchema, { displayName: BAD }],
  ["отзыв", createReviewSchema, { bookingId: "b1", rating: 5, text: BAD }],
  ["ответ на отзыв", reviewReplySchema, { text: BAD }],
  ["отклик на оффер", applyModelOfferSchema, { consentToShoot: true, note: BAD, mediaIds: ["m1"] }],
  ["имя клиента", profileUpdateSchema, { firstName: BAD }],
];

describe("публичные поля отказывают на запрещённых словах", () => {
  it.each(cases)("%s", (_name, schema, value) => {
    const parsed = schema.safeParse(value);
    expect(parsed.success).toBe(false);
    expect(findForbiddenWordsIssue(parsed.error!)).not.toBeNull();
  });

  it("то же поле без запрещённых слов проходит", () => {
    expect(createMasterServiceSchema.safeParse({ title: "Аппаратный педикюр", price: 0, durationMin: 30 }).success).toBe(true);
  });
});

describe("отказ доходит до человека", () => {
  it("parseBody — 422 FORBIDDEN_WORDS и понятная строка", async () => {
    const req = new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ text: BAD }) });
    const error = await parseBody(req, reviewReplySchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(422);
    expect((error as AppError).code).toBe("FORBIDDEN_WORDS");
    expect((error as AppError).message).toBe("Уберите недопустимые слова и попробуйте ещё раз.");
  });

  it("formatZodError — только строка отказа, без «поле: …»", () => {
    const parsed = reviewReplySchema.safeParse({ text: BAD });
    expect(formatZodError(parsed.error!)).toBe("Уберите недопустимые слова и попробуйте ещё раз.");
  });

  it("адрес страницы", () => {
    expect(validateUsername("anna-huy").ok).toBe(false);
    expect(validateUsername("anna-sokolova").ok).toBe(true);
  });
});
