import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterProfileData, updateMasterProfile } from "@/lib/master/profile.service";
import { updateMasterProfileSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const jsonUtf8Headers = { "Content-Type": "application/json; charset=utf-8" };

function jsonProfileOk<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200, headers: jsonUtf8Headers });
}

function jsonProfileFail(status: number, message: string, code?: string) {
  return NextResponse.json(
    { ok: false, error: message, code },
    { status, headers: jsonUtf8Headers }
  );
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const data = await getMasterProfileData(masterId);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/profile failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/profile",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonProfileFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, updateMasterProfileSchema);
    const addressProvided = body.address !== undefined;
    const hasGeoLat = body.geoLat !== undefined;
    const hasGeoLng = body.geoLng !== undefined;
    if (hasGeoLat !== hasGeoLng) {
      return jsonProfileFail(400, "ADDRESS_COORDS_REQUIRED", "ADDRESS_COORDS_REQUIRED");
    }
    if (addressProvided) {
      const trimmed = body.address?.trim() ?? "";
      if (trimmed) {
        if (!hasGeoLat || body.geoLat === null || body.geoLng === null) {
          return jsonProfileFail(400, "ADDRESS_COORDS_REQUIRED", "ADDRESS_COORDS_REQUIRED");
        }
      } else {
        if (!hasGeoLat || body.geoLat !== null || body.geoLng !== null) {
          return jsonProfileFail(400, "ADDRESS_COORDS_REQUIRED", "ADDRESS_COORDS_REQUIRED");
        }
      }
    }
    const data = await updateMasterProfile(masterId, {
      ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.geoLat !== undefined ? { geoLat: body.geoLat } : {}),
      ...(body.geoLng !== undefined ? { geoLng: body.geoLng } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.district !== undefined ? { district: body.district } : {}),
    });
    return jsonProfileOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PATCH /api/master/profile failed", {
        requestId: getRequestId(req),
        route: "PATCH /api/master/profile",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonProfileFail(appError.status, appError.message, appError.code);
  }
}
