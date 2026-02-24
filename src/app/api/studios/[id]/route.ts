import { ok, fail } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { requireAuth } from "@/lib/auth/guards";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { ensureStudioAdmin } from "@/lib/studios/access";
import { getStudioProviderById, updateStudioProviderProfile } from "@/lib/studios/studio";
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
    description: z.string().trim().max(2000).nullable().optional(),
    geoLat: z.number().nullable().optional(),
    geoLng: z.number().nullable().optional(),
    isPublished: z.boolean().optional(),
    timezone: z.string().trim().optional(),
    bannerAssetId: z.string().trim().nullable().optional(),
    cancellationDeadlineHours: z.number().int().min(0).max(168).nullable().optional(),
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
      data.description !== undefined ||
      data.geoLat !== undefined ||
      data.geoLng !== undefined ||
      data.isPublished !== undefined ||
      data.timezone !== undefined ||
      data.bannerAssetId !== undefined ||
      data.cancellationDeadlineHours !== undefined ||
      data.remindersEnabled !== undefined,
    { message: "At least one field is required" }
  );

function coordsRequired() {
  return NextResponse.json({ ok: false, error: "ADDRESS_COORDS_REQUIRED" }, { status: 400 });
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
  if (!studio) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

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

  const updated = await updateStudioProviderProfile(id, payload);
  if (!updated) return fail("Studio not found", 404, "STUDIO_NOT_FOUND");

  return ok({ studio: updated });
}
