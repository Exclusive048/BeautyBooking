import { z } from "zod";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { normalizeStudioServiceDurationMin, normalizeStudioServicePrice } from "@/lib/studio/service-normalization";

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

export const studioClientsQuerySchema = z.object({
  studioId: z.string().trim().min(1),
  sort: z.enum(["newest"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const studioFinanceQuerySchema = z.object({
  studioId: z.string().trim().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupBy: z.enum(["masters", "categories", "services"]).default("masters"),
});

export const studioFinanceSummaryQuerySchema = z.object({
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
  // CATEGORY-UNIFICATION-A: legacy ServiceCategory FK relaxed to optional.
  // New flow attaches services to GlobalCategory via globalCategoryId —
  // that is what the public catalog filters on. The legacy
  // `studio-settings-page.tsx` services tab still supplies categoryId
  // and keeps working.
  categoryId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  // Required for catalog visibility (approved global OR own-pending).
  // When absent the service stays creatable but invisible to public
  // category filters.
  globalCategoryId: z.string().trim().min(1).optional(),
  basePrice: z.number().int().min(0).transform((value) => normalizeStudioServicePrice(value)),
  baseDurationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .transform((value) => normalizeStudioServiceDurationMin(value)),
});

export const updateStudioServiceSchema = z.object({
  studioId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  globalCategoryId: z.string().trim().min(1).nullable().optional(),
  onlinePaymentEnabled: z.boolean().optional(),
  basePrice: z
    .number()
    .int()
    .min(0)
    .optional()
    .transform((value) => (typeof value === "number" ? normalizeStudioServicePrice(value) : undefined)),
  baseDurationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional()
    .transform((value) => (typeof value === "number" ? normalizeStudioServiceDurationMin(value) : undefined)),
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
  isEnabled: z.boolean().optional(),
});

export const studioMasterQuerySchema = z.object({
  studioId: z.string().trim().min(1),
});

export const updateStudioMasterSchema = z.object({
  studioId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().min(1).max(240).optional(),
  // STUDIO-EDIT-MASTER-PROFILE-01: описание можно и очистить (пустая строка).
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * STUDIO-INVITE-EMAIL-01 — мастера приглашают по телефону ИЛИ по почте, ровно
 * одним контактом. Почта приводится к нижнему регистру: так она хранится в
 * `StudioInvite.email` и так сравнивается с адресом аккаунта.
 */
export const createStudioMasterSchema = z
  .object({
    studioId: z.string().trim().min(1),
    displayName: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .min(1, "Phone is required")
      .transform((value) => normalizeRussianPhone(value))
      .refine((value): value is string => value !== null, {
        message: "Phone must match +7XXXXXXXXXX or 8XXXXXXXXXX",
      })
      .optional(),
    email: z.string().trim().toLowerCase().email("Проверьте адрес почты.").max(254).optional(),
    title: z.string().trim().min(1, "Title is required").max(240),
  })
  .refine((value) => Boolean(value.phone) !== Boolean(value.email), {
    message: "Укажите телефон или почту мастера.",
    path: ["phone"],
  });

export const bulkMasterServicesSchema = z.object({
  studioId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        serviceId: z.string().trim().min(1),
        isEnabled: z.boolean(),
        // SECURITY-EXPOSURE-AUDIT-01 #1 (R1c) defense-in-depth: bound the
        // overrides so a hostile/buggy payload can't set a negative price or a
        // calendar-blowing duration (the cross-tenant reach is closed by the
        // master-scoping above; these keep the values sane for one's own team).
        priceOverride: z.number().int().min(0).nullable().optional(),
        durationOverrideMin: z.number().int().min(1).max(24 * 60).nullable().optional(),
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
