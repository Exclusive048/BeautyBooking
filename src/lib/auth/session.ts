import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, verifyToken, type SessionPayload } from "./jwt";
import type { NextResponse } from "next/server";

const ACCESS_COOKIE_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_COOKIE_NAME = "bh_refresh";
const REFRESH_COOKIE_PATH = "/api/auth/refresh";

function getAccessCookieName(): string {
  return process.env.AUTH_COOKIE_NAME ?? "bh_session";
}

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

type SessionCookiePayload = Omit<SessionPayload, "iat" | "exp" | "tokenType" | "jti">;

async function getAccessSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAccessCookieName())?.value;
  if (!token) return null;
  return verifyToken(token, "access");
}

export function setSessionCookies(response: NextResponse, payload: SessionCookiePayload): void {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: payload.sub });

  response.cookies.set(getAccessCookieName(), accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });

  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function setAccessSessionCookie(response: NextResponse, payload: SessionCookiePayload): void {
  const accessToken = signAccessToken(payload);
  response.cookies.set(getAccessCookieName(), accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(getAccessCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const payload = await getAccessSessionPayload();
  return payload?.sub ?? null;
}

export async function getSessionUser() {
  const payload = await getAccessSessionPayload();
  if (!payload) return null;

  const user = await prisma.userProfile.findFirst({
    where: { id: payload.sub, isDeleted: false },
  });

  return user;
}
