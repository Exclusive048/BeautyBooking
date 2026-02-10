import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import {
  VK_AUTH_MODE_COOKIE,
  VK_AUTH_STATE_COOKIE,
  VK_AUTH_STATE_TTL_SECONDS,
} from "@/lib/vk/cookies";

function resolveMode(value: string | null): "login" | "link" {
  return value === "link" ? "link" : "login";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = resolveMode(url.searchParams.get("mode"));
    const state = randomBytes(16).toString("hex");
    const redirectUri = requireVkRedirectUri();
    const authUrl = buildVkAuthorizeUrl(state, redirectUri);

    const cookieStore = await cookies();
    cookieStore.set(VK_AUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VK_AUTH_STATE_TTL_SECONDS,
    });
    cookieStore.set(VK_AUTH_MODE_COOKIE, mode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VK_AUTH_STATE_TTL_SECONDS,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
