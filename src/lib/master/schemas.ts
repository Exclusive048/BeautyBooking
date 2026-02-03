import { z } from "zod";

export const masterDayQuerySchema = z.object({
  date: z.string().trim().min(1),
});

export const masterBookingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED", "NO_SHOW"]),
});

export const createMasterBookingSchema = z.object({
  startAt: z.string().datetime(),
  serviceId: z.string().trim().min(1),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().max(32).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const masterScheduleQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const masterCreateExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["OFF", "SHIFT"]),
  startTime: hhmmSchema.optional(),
  endTime: hhmmSchema.optional(),
});

export const masterCreateBlockSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: z.enum(["BREAK", "BLOCK"]).default("BLOCK"),
  note: z.string().trim().max(500).optional(),
});

export const updateMasterProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().max(240).optional(),
  bio: z.string().trim().max(4000).optional(),
  avatarUrl: z.string().url().max(2000).nullable().optional(),
  isPublished: z.boolean().optional(),
});

export const upsertMasterServicesSchema = z.object({
  items: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        isEnabled: z.boolean(),
        durationOverrideMin: z.number().int().min(1).max(24 * 60).nullable().optional(),
        priceOverride: z.number().int().min(0).nullable().optional(),
      })
    )
    .max(500),
});

export const createMasterServiceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  price: z.number().int().min(0),
  durationMin: z.number().int().min(1).max(24 * 60),
});

export const createMasterPortfolioSchema = z.object({
  mediaUrl: z.string().url().max(2000),
  caption: z.string().trim().max(2000).optional(),
  serviceIds: z.array(z.string().trim().min(1)).max(20),
});
