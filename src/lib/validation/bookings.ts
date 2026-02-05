import { z } from "zod";

const dateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date" });

export const bookingCreateSchema = z
  .object({
    providerId: z.string().trim().min(1, "Provider id is required"),
    serviceId: z.string().trim().min(1, "Service id is required"),
    masterProviderId: z.string().trim().min(1).optional(),
    startAtUtc: dateString.optional(),
    endAtUtc: dateString.optional(),
    slotLabel: z.string().trim().min(1, "Slot is required").max(120),
    clientName: z.string().trim().min(1, "Client name is required").max(120),
    clientPhone: z.string().trim().min(1, "Client phone is required").max(40),
    comment: z.string().trim().max(500).nullable().optional(),
    silentMode: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endAtUtc && !value.startAtUtc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startAtUtc is required when endAtUtc is provided",
        path: ["startAtUtc"],
      });
    }
    if (value.startAtUtc && value.endAtUtc) {
      const start = Date.parse(value.startAtUtc);
      const end = Date.parse(value.endAtUtc);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endAtUtc must be greater than startAtUtc",
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
        message: "endAtUtc must be greater than startAtUtc",
        path: ["endAtUtc"],
      });
    }
  });
