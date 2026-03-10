import { z } from "zod";

export const masterDayQuerySchema = z.object({
  date: z.string().trim().min(1),
});

export const masterBookingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "REJECTED", "CANCELLED", "NO_SHOW"]),
  comment: z.string().trim().min(1).max(500).optional(),
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
const avatarUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => /^https?:\/\/\S+$/i.test(value) || /^\/[^\s]+$/.test(value), {
    message: "avatarUrl must be absolute URL or root-relative path",
  });

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

const scheduleRuleBreakSchema = z.object({
  startLocal: hhmmSchema,
  endLocal: hhmmSchema,
});

const scheduleRuleDaySchema = z.object({
  isWorkday: z.boolean(),
  startLocal: hhmmSchema.optional().nullable(),
  endLocal: hhmmSchema.optional().nullable(),
  breaks: z.array(scheduleRuleBreakSchema).max(3).optional(),
});

const scheduleRuleWeeklyDaySchema = scheduleRuleDaySchema.extend({
  dayOfWeek: z.number().int().min(0).max(6),
});

const weeklyRulePayloadSchema = z.object({
  weekly: z.array(scheduleRuleWeeklyDaySchema).max(7),
});

const cycleRulePayloadSchema = z.object({
  cycle: z.object({
    days: z.array(scheduleRuleDaySchema).min(1).max(60),
  }),
});

export const masterScheduleRuleSchema = z
  .object({
    kind: z.enum(["WEEKLY", "CYCLE"]),
    timezone: z.string().trim().min(1).optional(),
    anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bufferBetweenBookingsMin: z.number().int().min(0).max(30).optional(),
    payload: z.union([weeklyRulePayloadSchema, cycleRulePayloadSchema]),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "CYCLE" && !value.anchorDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anchorDate"],
        message: "anchorDate is required for CYCLE",
      });
    }
    if (value.kind === "WEEKLY" && !("weekly" in value.payload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "weekly payload expected",
      });
    }
    if (value.kind === "CYCLE" && !("cycle" in value.payload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "cycle payload expected",
      });
    }
  });

export const updateMasterProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().max(240).optional(),
  address: z.string().trim().max(240).optional(),
  geoLat: z.number().finite().nullable().optional(),
  geoLng: z.number().finite().nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  isPublished: z.boolean().optional(),
});

export const upsertMasterServicesSchema = z.object({
  items: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        isEnabled: z.boolean(),
        onlinePaymentEnabled: z.boolean().optional(),
        durationOverrideMin: z.number().int().min(1).max(24 * 60).nullable().optional(),
        priceOverride: z.number().int().min(0).nullable().optional(),
        globalCategoryId: z.string().trim().min(1).nullable().optional(),
      })
    )
    .max(500),
});

export const createMasterServiceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  price: z.number().int().min(0),
  durationMin: z.number().int().min(1).max(24 * 60),
  globalCategoryId: z.string().trim().min(1).optional(),
});

const bookingQuestionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(10).max(300),
  required: z.boolean(),
  order: z.number().int().min(0).max(1000),
});

export const serviceBookingConfigSchema = z.object({
  requiresReferencePhoto: z.boolean(),
  questions: z.array(bookingQuestionSchema).max(5),
});

export const createMasterPortfolioSchema = z.object({
  mediaAssetId: z.string().trim().min(1).optional(),
  mediaUrl: z.string().url().max(2000).optional(),
  caption: z.string().trim().max(2000).optional(),
  serviceIds: z.array(z.string().trim().min(1)).max(20),
  tagIds: z.array(z.string().trim().min(1)).max(20).optional(),
  globalCategoryId: z.string().trim().min(1).optional(),
  categorySource: z.enum(["ai", "user"]).optional(),
}).superRefine((value, ctx) => {
  if (!value.mediaAssetId && !value.mediaUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mediaAssetId"],
      message: "mediaAssetId or mediaUrl is required",
    });
  }
});

export const updateMasterPortfolioCategorySchema = z.object({
  globalCategoryId: z.string().trim().min(1).nullable(),
});
