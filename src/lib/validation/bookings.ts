import { z } from "zod";

const dateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Некорректная дата." });

const bookingAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  questionText: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1000),
});

export const bookingCreateSchema = z
  .object({
    providerId: z.string().trim().min(1, "Не указан провайдер."),
    serviceId: z.string().trim().min(1, "Не указана услуга."),
    masterProviderId: z.string().trim().min(1).optional(),
    startAtUtc: dateString.optional(),
    endAtUtc: dateString.optional(),
    slotLabel: z.string().trim().min(1, "Не указан слот.").max(120),
    clientName: z.string().trim().min(1, "Не указано имя клиента.").max(120),
    clientPhone: z.string().trim().min(1, "Не указан телефон клиента.").max(40),
    comment: z.string().trim().max(500).nullable().optional(),
    silentMode: z.boolean().optional(),
    referencePhotoAssetId: z.string().trim().min(1).nullable().optional(),
    bookingAnswers: z.array(bookingAnswerSchema).max(5).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endAtUtc && !value.startAtUtc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startAtUtc обязателен, если указан endAtUtc.",
        path: ["startAtUtc"],
      });
    }
    if (value.startAtUtc && value.endAtUtc) {
      const start = Date.parse(value.startAtUtc);
      const end = Date.parse(value.endAtUtc);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endAtUtc должен быть позже startAtUtc.",
          path: ["endAtUtc"],
        });
      }
    }
  });

export const bookingCancelSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const bookingRescheduleSchema = z
  .object({
    startAtUtc: dateString,
    endAtUtc: dateString,
    slotLabel: z.string().trim().min(1).max(120),
    silentMode: z.boolean().optional(),
    comment: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(value.startAtUtc);
    const end = Date.parse(value.endAtUtc);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endAtUtc должен быть позже startAtUtc.",
        path: ["endAtUtc"],
      });
    }
  });
