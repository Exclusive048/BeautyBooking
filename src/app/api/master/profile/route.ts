import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError, type ErrorCode } from "@/lib/api/errors";
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

/**
 * FIX-B18 · SUPPORT-ENVELOPE-SHAPE — переведён на конверт проекта.
 *
 * Здесь была собственная форма `{ ok:false, error: <строка>, code }`: `error`
 * строкой, `code` соседом, и всё мимо `fail()`/`jsonFail()`, то есть мимо
 * `check:error-message-lang`. Цена границы была не теоретической — аудит нашёл
 * в этом файле ЧЕТЫРЕ сообщения, которые гейт не мог увидеть: `"Unauthorized"`
 * и трижды `"ADDRESS_COORDS_REQUIRED"`, то есть машинный код в поле текста.
 * Ровно дефект FIX-B14, доживший в файле, чья строка в замороженном инвентаре
 * утверждала «тексты русские».
 *
 * `jsonUtf8Headers` сохранён: `NextResponse.json` и так ставит charset, но
 * заголовок здесь был явным с самого начала, и снимать его — отдельное
 * изменение, к форме конверта отношения не имеющее.
 */
function jsonProfileFail(status: number, message: string, code: ErrorCode) {
  const response = jsonFail(status, message, code);
  for (const [key, value] of Object.entries(jsonUtf8Headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
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
    if (!user) return jsonProfileFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, updateMasterProfileSchema);
    const addressProvided = body.address !== undefined;
    const hasGeoLat = body.geoLat !== undefined;
    const hasGeoLng = body.geoLng !== undefined;
    if (hasGeoLat !== hasGeoLng) {
      return jsonProfileFail(400, "Укажите адрес через подсказку — нужны координаты.", "ADDRESS_COORDS_REQUIRED");
    }
    if (addressProvided) {
      const trimmed = body.address?.trim() ?? "";
      if (trimmed) {
        if (!hasGeoLat || body.geoLat === null || body.geoLng === null) {
          return jsonProfileFail(400, "Укажите адрес через подсказку — нужны координаты.", "ADDRESS_COORDS_REQUIRED");
        }
      } else {
        if (!hasGeoLat || body.geoLat !== null || body.geoLng !== null) {
          return jsonProfileFail(400, "Укажите адрес через подсказку — нужны координаты.", "ADDRESS_COORDS_REQUIRED");
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
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.socialVk !== undefined ? { socialVk: body.socialVk } : {}),
      ...(body.socialInstagram !== undefined ? { socialInstagram: body.socialInstagram } : {}),
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
