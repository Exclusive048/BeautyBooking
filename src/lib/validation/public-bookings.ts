import { z } from "zod";

const isoDateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Некорректная дата." });

const answerSchema = z.object({
  questionId: z.string().trim().min(1),
  questionText: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1000),
});

/**
 * Public (no-auth) booking payload (32b).
 *
 * Mirrors the auth `bookingCreateSchema` minus `masterProviderId` and
 * with `clientName` + `clientPhone` required (no session to source
 * them from). `bookingAnswers` and `referencePhotoAssetId` are kept
 * because ServiceBookingConfig is a customer-research-validated
 * feature, not optional polish.
 */
export const publicBookingCreateSchema = z
  .object({
    providerId: z.string().trim().min(1, "Не указан мастер."),
    serviceId: z.string().trim().min(1, "Не указана услуга."),
    hotSlotId: z.string().trim().min(1).nullable().optional(),
    startAtUtc: isoDateString,
    endAtUtc: isoDateString,
    slotLabel: z.string().trim().min(1, "Не указан слот.").max(120),
    clientName: z.string().trim().min(1, "Укажите имя.").max(120),
    clientPhone: z.string().trim().min(5, "Проверьте номер телефона.").max(40),
    comment: z.string().trim().max(500).nullable().optional(),
    silentMode: z.boolean().optional(),
    referencePhotoAssetId: z.string().trim().min(1).nullable().optional(),
    bookingAnswers: z.array(answerSchema).max(5).optional(),
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

export type PublicBookingInput = z.infer<typeof publicBookingCreateSchema>;
