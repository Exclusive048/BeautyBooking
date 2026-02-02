import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { mediaAssetIdParamSchema } from "@/lib/media/schemas";
import { getMediaFile } from "@/lib/media/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = mediaAssetIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { message: "Validation error", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const user = await getSessionUser();
    const file = await getMediaFile(user, parsed.data.id);
    return new NextResponse(file.stream, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.contentLength),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/media/file/[id] failed", {
        requestId,
        route: "GET /api/media/file/{id}",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return NextResponse.json(
      { ok: false, error: { message: appError.message, code: appError.code } },
      { status: appError.status }
    );
  }
}
