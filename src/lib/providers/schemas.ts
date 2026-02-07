import { z } from "zod";

export const providerIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const emptyBodySchema = z.object({}).strict();

export const providerAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const providerSettingsSchema = z.object({
  autoConfirmBookings: z.boolean(),
});
