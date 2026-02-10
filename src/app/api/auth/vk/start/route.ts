import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/vk/pkce";
import { signVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_STATE_TTL_SECONDS, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";

export async function GET() {
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const redirectUri = requireVkRedirectUri("auth");
    const authUrl = buildVkAuthorizeUrl({ state, codeChallenge, redirectUri });

    const cookieStore = await cookies();
    cookieStore.set(VK_ID_STATE_COOKIE, signVkCookieValue(state), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VK_ID_STATE_TTL_SECONDS,
    });
    cookieStore.set(VK_ID_VERIFIER_COOKIE, signVkCookieValue(codeVerifier), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VK_ID_STATE_TTL_SECONDS,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
