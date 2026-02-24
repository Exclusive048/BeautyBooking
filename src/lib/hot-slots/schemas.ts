import { z } from "zod";
import {
  HOT_SLOT_FIXED_MAX,
  HOT_SLOT_FIXED_MIN,
  HOT_SLOT_PERCENT_VALUES,
  HOT_SLOT_TRIGGER_HOURS,
} from "@/lib/hot-slots/constants";

const triggerHoursSchema = z
  .number()
  .int()
  .refine((value) => HOT_SLOT_TRIGGER_HOURS.includes(value as (typeof HOT_SLOT_TRIGGER_HOURS)[number]), {
    message: "Допустимы только 48, 24, 12 или 0 часов.",
  });

const discountTypeSchema = z.enum(["PERCENT", "FIXED"]);
const applyModeSchema = z.enum(["ALL_SERVICES", "PRICE_FROM", "MANUAL"]);

export const hotSlotRuleSchema = z
  .object({
    isEnabled: z.boolean(),
    triggerHours: triggerHoursSchema,
    discountType: discountTypeSchema,
    discountValue: z.coerce.number().int(),
    applyMode: applyModeSchema,
    minPriceFrom: z.coerce.number().int().min(0).nullable().optional(),
    serviceIds: z.array(z.string().trim().min(1)).max(50).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === "PERCENT") {
      if (!HOT_SLOT_PERCENT_VALUES.includes(value.discountValue as (typeof HOT_SLOT_PERCENT_VALUES)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountValue"],
          message: "Для процента доступны значения 10, 20 или 30.",
        });
      }
    }

    if (value.discountType === "FIXED") {
      if (value.discountValue < HOT_SLOT_FIXED_MIN || value.discountValue > HOT_SLOT_FIXED_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountValue"],
          message: `Фиксированная скидка должна быть от ${HOT_SLOT_FIXED_MIN} до ${HOT_SLOT_FIXED_MAX} ₽.`,
        });
      }
    }

    if (value.applyMode === "PRICE_FROM") {
      if (value.minPriceFrom === null || value.minPriceFrom === undefined || value.minPriceFrom <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minPriceFrom"],
          message: "Укажите минимальную цену для правила.",
        });
      }
    }

    if (value.applyMode === "MANUAL" && value.serviceIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceIds"],
        message: "Выберите хотя бы одну услугу.",
      });
    }
  });

export type HotSlotRuleInput = z.infer<typeof hotSlotRuleSchema>;

export const hotSlotSubscriptionSchema = z.object({
  providerId: z.string().trim().min(1),
});

export type HotSlotSubscriptionInput = z.infer<typeof hotSlotSubscriptionSchema>;
