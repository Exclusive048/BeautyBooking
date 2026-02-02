import { z } from "zod";

export const studioCalendarQuerySchema = z.object({
  studioId: z.string().trim().min(1),
  date: z.string().trim().min(1),
  view: z.enum(["day", "week", "month"]).default("week"),
  masterIds: z.string().trim().optional(),
});

export const createStudioBlockSchema = z.object({
  studioId: z.string().trim().min(1),
  masterId: z.string().trim().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  type: z.enum(["BREAK", "BLOCK"]),
  note: z.string().trim().max(500).optional(),
});

export const studioServicesQuerySchema = z.object({
  studioId: z.string().trim().min(1),
});

export const createStudioCategorySchema = z.object({
  studioId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
});

export const updateStudioCategorySchema = z.object({
  studioId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
});

export const reorderStudioCategoriesSchema = z.object({
  studioId: z.string().trim().min(1),
  orderedIds: z.array(z.string().trim().min(1)).min(1).max(500),
});

export const createStudioServiceSchema = z.object({
  studioId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  basePrice: z.number().int().min(0),
  baseDurationMin: z.number().int().min(1).max(24 * 60),
});

export const updateStudioServiceSchema = z.object({
  studioId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  basePrice: z.number().int().min(0).optional(),
  baseDurationMin: z.number().int().min(1).max(24 * 60).optional(),
  isActive: z.boolean().optional(),
});

export const reorderStudioServicesSchema = z.object({
  studioId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1),
  orderedIds: z.array(z.string().trim().min(1)).min(1).max(1000),
});

export const assignMasterToServiceSchema = z.object({
  studioId: z.string().trim().min(1),
  masterId: z.string().trim().min(1),
});

export const studioMasterQuerySchema = z.object({
  studioId: z.string().trim().min(1),
});

export const updateStudioMasterSchema = z.object({
  studioId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().min(1).max(240).optional(),
  isActive: z.boolean().optional(),
});

export const createStudioMasterSchema = z.object({
  studioId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(32).optional(),
  title: z.string().trim().max(240).optional(),
});

const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const createWorkShiftTemplateSchema = z.object({
  studioId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
  startTime: hhmmSchema,
  endTime: hhmmSchema,
});

export const upsertDayRulesSchema = z.object({
  studioId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        templateId: z.string().trim().min(1),
        isWorking: z.boolean(),
      })
    )
    .max(7),
});

export const createWorkExceptionSchema = z.object({
  studioId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["OFF", "SHIFT"]),
  startTime: hhmmSchema.optional(),
  endTime: hhmmSchema.optional(),
});

export const deleteWorkExceptionSchema = z.object({
  studioId: z.string().trim().min(1),
});

export const bulkMasterServicesSchema = z.object({
  studioId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        isEnabled: z.boolean(),
        priceOverride: z.number().int().nullable().optional(),
        durationOverrideMin: z.number().int().nullable().optional(),
        commissionPct: z.number().min(0).max(100).nullable().optional(),
      })
    )
    .max(500),
});

export const moveStudioBookingSchema = z.object({
  studioId: z.string().trim().min(1),
  targetMasterId: z.string().trim().min(1),
  targetStartAt: z.string().datetime(),
  strategy: z.enum(["KEEP_SERVICE", "CHANGE_SERVICE"]),
  pricing: z.enum(["KEEP_PRICE", "APPLY_TARGET"]),
});

export const updateStudioBlockSchema = z.object({
  studioId: z.string().trim().min(1),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  type: z.enum(["BREAK", "BLOCK"]).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const deleteStudioBlockSchema = z.object({
  studioId: z.string().trim().min(1),
});

export const createStudioBookingSchema = z.object({
  studioId: z.string().trim().min(1),
  masterId: z.string().trim().min(1),
  startAt: z.string().datetime(),
  serviceId: z.string().trim().min(1),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().min(3).max(32).optional(),
  notes: z.string().trim().max(1000).optional(),
});
