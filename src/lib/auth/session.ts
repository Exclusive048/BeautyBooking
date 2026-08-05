import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env, isProduction } from "@/lib/env";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  type SessionPayload,
} from "./jwt";
import { recordSurfaceEvent } from "@/lib/monitoring/status";

const ACCESS_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;
const REFRESH_COOKIE_MAX_AGE_SECONDS = REFRESH_TOKEN_TTL_SECONDS;
const REFRESH_COOKIE_NAME = "bh_refresh";
const REFRESH_COOKIE_PATH = "/api/auth/refresh";

export function getAccessCookieName(): string {
  return env.AUTH_COOKIE_NAME;
}

export function getRefreshCookieName(): string {
  return REFRESH_COOKIE_NAME;
}

function isSecureCookie(): boolean {
  return isProduction;
}

type SessionCookiePayload = Omit<SessionPayload, "iat" | "exp" | "tokenType" | "jti" | "sid">;
type RefreshTokenClaims = {
  sub: string;
  sid: string;
  jti: string;
};

export type RefreshSessionRevokeResult =
  | "NO_TOKEN"
  | "INVALID_TOKEN"
  | "REVOKED"
  | "ALREADY_INACTIVE";

function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const entries = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return [part, ""] as const;
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()] as const;
    });
  return Object.fromEntries(entries);
}

function parseAccessTokenPayload(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  return verifyToken(token, "access");
}

/**
 * SEC-13 — access-токен действителен, только пока жива его СЕМЬЯ сессий.
 *
 * Раньше проверялся лишь флаг удаления пользователя, поэтому «завершить все
 * остальные сессии» и logout гасили только refresh-строки: украденный
 * access-токен продолжал работать до истечения своих 2 часов. Для человека,
 * который жмёт эту кнопку ИМЕННО потому, что подозревает компрометацию, это
 * ровно то окно, в котором злоумышленник ещё внутри.
 *
 * Привязка идёт к `familyId`, а не к `RefreshSession.id`: ротация помечает
 * старую строку `revokedAt` и создаёт новую, так что привязка к строке
 * обнуляла бы живой access-токен при каждом обновлении сессии. Семья же
 * наследуется по цепочке ротации и умирает только от явного отзыва.
 *
 * Токены без `fid` (выпущенные до SEC-13) проходят как legacy — иначе деплой
 * разлогинил бы всех разом. Они живут не дольше своего TTL.
 */
async function loadActiveSessionUser(userId: string, familyId?: string | null) {
  return prisma.userProfile.findFirst({
    where: {
      id: userId,
      isDeleted: false,
      ...(familyId
        ? { refreshSessions: { some: { familyId, revokedAt: null } } }
        : {}),
    },
  });
}

async function getAccessSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getAccessCookieName())?.value;
  return parseAccessTokenPayload(token);
}

export function getAccessTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  const allCookies = parseCookieHeader(header);
  const token = allCookies[getAccessCookieName()];
  return token || null;
}

export async function getSessionUserFromRequest(req: Request) {
  const payload = parseAccessTokenPayload(getAccessTokenFromRequest(req));
  if (!payload?.sub) return null;
  return loadActiveSessionUser(payload.sub, payload.fid);
}

function buildRefreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

function parseRefreshTokenClaims(refreshToken: string): RefreshTokenClaims | null {
  const payload = verifyToken(refreshToken, "refresh");
  if (!payload?.sub || !payload.sid || !payload.jti) return null;
  return {
    sub: payload.sub,
    sid: payload.sid,
    jti: payload.jti,
  };
}

function setAccessCookie(response: NextResponse, accessToken: string): void {
  response.cookies.set(getAccessCookieName(), accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });
}

function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function setSessionCookies(response: NextResponse, payload: SessionCookiePayload): Promise<void> {
  // SEC-13: новая сессия = новая семья. Идентификатор генерируем сами, а не
  // берём id строки, — тогда хватает одного запроса и семья остаётся
  // самостоятельным понятием, а не псевдонимом первой строки цепочки.
  const familyId = crypto.randomUUID();
  const refreshSession = await prisma.refreshSession.create({
    data: {
      userId: payload.sub,
      jti: crypto.randomUUID(),
      familyId,
      expiresAt: buildRefreshExpiresAt(),
    },
    select: {
      id: true,
      jti: true,
    },
  });

  const accessToken = signAccessToken({ ...payload, fid: familyId });
  const refreshToken = signRefreshToken({ sub: payload.sub, sid: refreshSession.id, jti: refreshSession.jti });

  setAccessCookie(response, accessToken);
  setRefreshCookie(response, refreshToken);
  void recordSurfaceEvent({
    surface: "auth",
    outcome: "success",
    operation: "session-issue",
  });
}

export function setAccessSessionCookie(response: NextResponse, payload: SessionCookiePayload): void {
  const accessToken = signAccessToken(payload);
  setAccessCookie(response, accessToken);
}

export async function rotateSessionCookies(
  response: NextResponse,
  refreshToken: string
): Promise<SessionCookiePayload | null> {
  const claims = parseRefreshTokenClaims(refreshToken);
  if (!claims) return null;

  const now = new Date();
  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshSession.updateMany({
      where: {
        id: claims.sid,
        userId: claims.sub,
        jti: claims.jti,
        revokedAt: null,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;

    const user = await tx.userProfile.findFirst({
      where: { id: claims.sub, isDeleted: false },
      select: { id: true, phone: true, roles: true },
    });
    if (!user) {
      await tx.refreshSession.updateMany({
        where: { id: claims.sid, revokedAt: null },
        data: { revokedAt: now },
      });
      return null;
    }

    // SEC-13: ротация продолжает ТУ ЖЕ семью, иначе живой access-токен
    // умирал бы при каждом обновлении сессии. Строки, выпущенные до миграции,
    // семьи не имеют — для них семьёй становится их собственный id, так что
    // цепочка получает её со следующей ротации и дальше уже отзываема.
    const claimedSession = await tx.refreshSession.findUnique({
      where: { id: claims.sid },
      select: { familyId: true },
    });
    const familyId = claimedSession?.familyId ?? claims.sid;

    const nextSession = await tx.refreshSession.create({
      data: {
        userId: user.id,
        jti: crypto.randomUUID(),
        familyId,
        expiresAt: buildRefreshExpiresAt(),
      },
      select: { id: true, jti: true },
    });

    await tx.refreshSession.update({
      where: { id: claims.sid },
      data: { rotatedToSessionId: nextSession.id },
    });

    return { user, nextSession, familyId };
  });

  if (!rotated) return null;

  const payload: SessionCookiePayload = {
    sub: rotated.user.id,
    phone: rotated.user.phone ?? null,
    roles: rotated.user.roles,
  };
  const accessToken = signAccessToken({ ...payload, fid: rotated.familyId });
  const nextRefreshToken = signRefreshToken({
    sub: rotated.user.id,
    sid: rotated.nextSession.id,
    jti: rotated.nextSession.jti,
  });

  setAccessCookie(response, accessToken);
  setRefreshCookie(response, nextRefreshToken);
  void recordSurfaceEvent({
    surface: "auth",
    outcome: "success",
    operation: "refresh-rotate",
  });
  return payload;
}

export async function revokeRefreshSessionByToken(
  refreshToken: string | null | undefined
): Promise<RefreshSessionRevokeResult> {
  if (!refreshToken) return "NO_TOKEN";
  const claims = parseRefreshTokenClaims(refreshToken);
  if (!claims) return "INVALID_TOKEN";

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        jti: claims.jti,
      },
      select: {
        id: true,
        rotatedToSessionId: true,
      },
    });
    if (!session) {
      return "ALREADY_INACTIVE" as const;
    }

    const chainIds: string[] = [];
    const seenIds = new Set<string>();
    let cursorId: string | null = session.id;
    while (cursorId && !seenIds.has(cursorId)) {
      seenIds.add(cursorId);
      chainIds.push(cursorId);
      const nextSession: { rotatedToSessionId: string | null } | null = await tx.refreshSession.findUnique({
        where: { id: cursorId },
        select: { rotatedToSessionId: true },
      });
      cursorId = nextSession?.rotatedToSessionId ?? null;
    }

    const revoked = await tx.refreshSession.updateMany({
      where: {
        id: { in: chainIds },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    return revoked.count > 0 ? ("REVOKED" as const) : ("ALREADY_INACTIVE" as const);
  });
  return result;
}

export async function revokeAndClearSessionCookies(
  response: NextResponse,
  refreshToken: string | null | undefined
): Promise<RefreshSessionRevokeResult> {
  const result = await revokeRefreshSessionByToken(refreshToken);
  clearSessionCookies(response);
  return result;
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

/**
 * SEC-13 — id тоже обязан проходить проверку сессии.
 *
 * Эта функция возвращала `payload.sub` прямо из токена, вообще не заглядывая в
 * БД: ни отзыв сессии, ни даже удаление аккаунта на неё не действовали. Живой
 * смоук поймал это на `/api/me` — устройство, у которого только что отозвали
 * сессию, продолжало отвечать 200, потому что этот путь шёл мимо
 * `loadActiveSessionUser`. Выбираем только `id`, чтобы не тянуть всю строку
 * профиля ради одного поля.
 */
export async function getSessionUserId(): Promise<string | null> {
  const payload = await getAccessSessionPayload();
  if (!payload?.sub) return null;
  const user = await prisma.userProfile.findFirst({
    where: {
      id: payload.sub,
      isDeleted: false,
      ...(payload.fid
        ? { refreshSessions: { some: { familyId: payload.fid, revokedAt: null } } }
        : {}),
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getSessionUser() {
  const payload = await getAccessSessionPayload();
  if (!payload?.sub) return null;
  return loadActiveSessionUser(payload.sub, payload.fid);
}
