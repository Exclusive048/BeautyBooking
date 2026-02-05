import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { createSoloMasterService, upsertMasterServices } from "@/lib/master/profile.service";
import { createMasterServiceSchema, upsertMasterServicesSchema } from "@/lib/master/schemas";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

function extractFieldErrors(details: unknown): Record<string, string> | undefined {
  if (typeof details !== "object" || details === null) return undefined;

  const fromDetails = (details as { fieldErrors?: unknown }).fieldErrors;
  if (typeof fromDetails === "object" && fromDetails !== null) {
    const mapped = Object.entries(fromDetails as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (typeof value === "string" && value.trim()) {
          acc[key] = value;
        } else if (Array.isArray(value)) {
          const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0);
          if (first) acc[key] = first;
        }
        return acc;
      },
      {}
    );
    if (Object.keys(mapped).length > 0) return mapped;
  }

  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return undefined;

  const mapped = issues.reduce<Record<string, string>>((acc, issue) => {
    if (typeof issue !== "object" || issue === null) return acc;
    const path = (issue as { path?: unknown }).path;
    const message = (issue as { message?: unknown }).message;
    if (typeof path === "string" && path.trim() && typeof message === "string" && message.trim()) {
      acc[path] = message;
    }
    return acc;
  }, {});
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, upsertMasterServicesSchema);
    const data = await upsertMasterServices(masterId, body.items);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("PUT /api/master/services failed", {
        requestId: getRequestId(req),
        route: "PUT /api/master/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(
      appError.status,
      appError.message,
      appError.code,
      appError.details,
      extractFieldErrors(appError.details)
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const masterId = await getCurrentMasterProviderId(user.id);
    const body = await parseBody(req, createMasterServiceSchema);
    const data = await createSoloMasterService(masterId, body);
    return jsonOk(data, { status: 201 });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/services failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/services",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(
      appError.status,
      appError.message,
      appError.code,
      appError.details,
      extractFieldErrors(appError.details)
    );
  }
}
