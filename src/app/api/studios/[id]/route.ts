import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { getStudioProviderById, updateStudioProviderProfile } from "@/lib/studios/studio";
import { isValidTimeZone } from "@/lib/schedule/timezone";
import { BOOKING_RULE_LIMITS } from "@/lib/schedule/editor-shared";
import { NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const updateSchema = z
  .object({
    name: z.string().trim().optional(),
    tagline: z.string().trim().optional(),
    address: z.string().trim().optional(),
    district: z.string().trim().optional(),
    categories: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    contactName: z.string().trim().nullable().optional(),
    contactPhone: z.string().trim().nullable().optional(),
    contactEmail: z.string().trim().email().nullable().optional(),
    // FEAT-PROVIDER-SOCIALS: raw input (URL or handle); normalized + host/scheme
    // validated server-side in updateStudioProviderProfile (the security boundary).
    socialVk: z.string().trim().max(200).nullable().optional(),
    socialInstagram: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    geoLat: z.number().nullable().optional(),
    geoLng: z.number().nullable().optional(),
    isPublished: z.boolean().optional(),
    // FIX-10: was `z.string().trim().optional()` — an empty/garbage tz persisted
    // and then 500'd `partsFromDate` across calendar/booking surfaces. Mirror the
    // master schema: bounded length + IANA validity.
    timezone: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .refine(isValidTimeZone, { message: "timezone must be a valid IANA timezone" })
      .optional(),
    bannerAssetId: z.string().trim().nullable().optional(),
    // CATALOG-MAIN-PHOTO: главное фото карточки каталога — из портфолио студии.
    catalogCoverAssetId: z.string().trim().min(1).max(64).nullable().optional(),
    // FIX-STUDIO-POLICY-EDITABLE: правила записи студии. Границы — те же, что у
    // мастерского редактора расписания (`editor-shared`), чтобы одно и то же
    // значение не оказывалось валидным на одной поверхности и отвергнутым на
    // другой. Запись делегируется `applyProviderBookingPolicy` (rule 5).
    minBookingHoursAhead: z.number().int().min(0).max(168).optional(),
    maxBookingDaysAhead: z
      .number()
      .int()
      .min(BOOKING_RULE_LIMITS.maxDaysAhead.min)
      .max(BOOKING_RULE_LIMITS.maxDaysAhead.max)
      .optional(),
    cancellationDeadlineHours: z.number().int().min(0).max(168).nullable().optional(),
    lateCancelAction: z.enum(["none", "reminder", "fine"]).optional(),
    acceptNewClients: z.boolean().optional(),
    remindersEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.tagline !== undefined ||
      data.address !== undefined ||
      data.district !== undefined ||
      data.categories !== undefined ||
      data.contactName !== undefined ||
      data.contactPhone !== undefined ||
      data.contactEmail !== undefined ||
      data.socialVk !== undefined ||
      data.socialInstagram !== undefined ||
      data.description !== undefined ||
      data.geoLat !== undefined ||
      data.geoLng !== undefined ||
      data.isPublished !== undefined ||
      data.timezone !== undefined ||
      data.bannerAssetId !== undefined ||
      data.catalogCoverAssetId !== undefined ||
      data.minBookingHoursAhead !== undefined ||
      data.maxBookingDaysAhead !== undefined ||
      data.cancellationDeadlineHours !== undefined ||
      data.lateCancelAction !== undefined ||
      data.acceptNewClients !== undefined ||
      data.remindersEnabled !== undefined,
    { message: "Заполните хотя бы одно поле." }
  );

function coordsRequired() {
  // FIX-B14: прежняя форма клала МАШИННЫЙ КОД в поле `error`, где UI ждёт
  // объект `{ message, code }` — то есть сообщения не было вовсе, а гейт
  // `check:error-message-lang` этого не видел (ответ собран мимо `fail()`).
  return fail("Укажите адрес — выберите его из подсказок.", 400, "ADDRESS_COORDS_REQUIRED");
}

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsed = providerIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsed.data;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  const studio = await getStudioProviderById(id);
  if (!studio) return fail("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  return ok({ studio });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
  const parsedParams = providerIdParamSchema.safeParse(params);
  if (!parsedParams.success) {
    return fail(formatZodError(parsedParams.error), 400, "VALIDATION_ERROR");
  }

  const { id } = parsedParams.data;
  const accessError = await ensureStudioAdmin(id, auth.user.id);
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  const parsedBody = updateSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(formatZodError(parsedBody.error), 400, "VALIDATION_ERROR");
  }
  const payload = parsedBody.data;
  const addressProvided = payload.address !== undefined;
  const hasGeoLat = payload.geoLat !== undefined;
  const hasGeoLng = payload.geoLng !== undefined;
  if (hasGeoLat !== hasGeoLng) {
    return coordsRequired();
  }
  if (addressProvided) {
    const trimmed = payload.address?.trim() ?? "";
    if (trimmed) {
      if (!hasGeoLat || payload.geoLat === null || payload.geoLng === null) {
        return coordsRequired();
      }
    } else {
      if (!hasGeoLat || payload.geoLat !== null || payload.geoLng !== null) {
        return coordsRequired();
      }
    }
  }

  // Surface AppError from the service (e.g. R2-02-B publish gate ADDRESS_REQUIRED)
  // as a clean 4xx instead of an unhandled 500.
  let updated;
  try {
    updated = await updateStudioProviderProfile(id, payload);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
  if (!updated) return fail("Студия не найдена.", 404, "STUDIO_NOT_FOUND");

  return ok({ studio: updated });
}
