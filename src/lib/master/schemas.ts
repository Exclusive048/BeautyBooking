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

const avatarUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => /^https?:\/\/\S+$/i.test(value) || /^\/[^\s]+$/.test(value), {
    message: "avatarUrl must be absolute URL or root-relative path",
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
        durationOverrideMin: z.number().int().min(15).max(12 * 60).nullable().optional(),
        priceOverride: z.number().int().min(0).nullable().optional(),
        globalCategoryId: z.string().trim().min(1).nullable().optional(),
      })
    )
    .max(500),
});

export const createMasterServiceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  price: z.number().int().min(0),
  durationMin: z.number().int().min(15).max(12 * 60),
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
