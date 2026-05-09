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
  // 31a: free-form district label (район/микрорайон) — display-only on
  // public surfaces, doesn't affect geocoding. Empty string clears it.
  district: z.string().trim().max(120).optional(),
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
        description: z.string().trim().max(2000).nullable().optional(),
      })
    )
    .max(500),
});

export const createMasterServiceSchema = z.object({
  title: z.string().trim().min(1).max(240),
  price: z.number().int().min(0),
  durationMin: z.number().int().min(15).max(12 * 60),
  globalCategoryId: z.string().trim().min(1).optional(),
  description: z.string().trim().max(2000).optional(),
  // 31c: optional toggles. Default to current behaviour when absent.
  isEnabled: z.boolean().optional(),
  onlinePaymentEnabled: z.boolean().optional(),
});

const SERVICE_FIELD_KEYS = [
  "name",
  "title",
  "description",
  "durationMin",
  "price",
  "globalCategoryId",
  "isEnabled",
  "onlinePaymentEnabled",
] as const;

export const updateMasterServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    title: z.string().trim().max(240).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMin: z.number().int().min(15).max(12 * 60).optional(),
    price: z.number().int().min(0).optional(),
    globalCategoryId: z.string().trim().min(1).nullable().optional(),
    isEnabled: z.boolean().optional(),
    onlinePaymentEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => SERVICE_FIELD_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key)),
    { message: "At least one field is required" }
  );

export const reorderMasterServiceSchema = z.object({
  itemId: z.string().trim().min(1),
  direction: z.enum(["up", "down"]),
});

const PACKAGE_DISCOUNT_TYPE = z.enum(["PERCENT", "FIXED"]);

export const createMasterPackageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  serviceIds: z.array(z.string().trim().min(1)).min(2).max(20),
  discountType: PACKAGE_DISCOUNT_TYPE,
  discountValue: z.number().int().min(0).max(1_000_000),
  isEnabled: z.boolean().optional(),
});

export const updateMasterPackageSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    serviceIds: z.array(z.string().trim().min(1)).min(2).max(20).optional(),
    discountType: PACKAGE_DISCOUNT_TYPE.optional(),
    discountValue: z.number().int().min(0).max(1_000_000).optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      Array.isArray(value.serviceIds) ||
      value.discountType !== undefined ||
      value.discountValue !== undefined ||
      value.isEnabled !== undefined,
    { message: "At least one field is required" }
  );

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

export const updateMasterPortfolioItemSchema = z
  .object({
    globalCategoryId: z.string().trim().min(1).nullable().optional(),
    serviceIds: z.array(z.string().trim().min(1)).max(20).optional(),
    tagIds: z.array(z.string().trim().min(1)).max(20).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Object.prototype.hasOwnProperty.call(value, "globalCategoryId") ||
      Array.isArray(value.serviceIds) ||
      Array.isArray(value.tagIds) ||
      typeof value.isPublic === "boolean",
    { message: "At least one field is required" }
  );

export const reorderMasterPortfolioSchema = z.object({
  itemId: z.string().trim().min(1),
  direction: z.enum(["up", "down"]),
});
