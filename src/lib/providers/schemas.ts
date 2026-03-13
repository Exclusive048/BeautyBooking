import { z } from "zod";

export const PROVIDER_LIST_DEFAULT_LIMIT = 24;
export const PROVIDER_LIST_MAX_LIMIT = 100;

export const providerIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const providerListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export const emptyBodySchema = z.object({}).strict();

export const providerAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const providerSettingsSchema = z
  .object({
    autoConfirmBookings: z.boolean().optional(),
    cancellationDeadlineHours: z.number().int().min(0).max(168).nullable().optional(),
    remindersEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.autoConfirmBookings !== undefined ||
      value.cancellationDeadlineHours !== undefined ||
      value.remindersEnabled !== undefined,
    { message: "At least one field is required" }
  );
