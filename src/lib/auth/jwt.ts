import crypto from "crypto";
import { env } from "@/lib/env";

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export type SessionPayload = {
  sub: string; // userId
  phone?: string | null;
  roles?: string[];
  tokenType?: "access" | "refresh";
  jti?: string;
  sid?: string;
  iat: number;
  exp: number;
};

export const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

type AccessTokenPayload = Omit<SessionPayload, "iat" | "exp" | "tokenType" | "jti" | "sid">;
type RefreshTokenPayload = Pick<SessionPayload, "sub" | "sid" | "jti">;

function createToken(
  payload: Record<string, unknown>,
  ttlSeconds: number,
  tokenType: "access" | "refresh",
  input?: { jti?: string }
) {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");

  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;

  const fullPayload: SessionPayload = {
    ...(payload as Omit<SessionPayload, "iat" | "exp">),
    tokenType,
    ...(input?.jti ? { jti: input.jti } : {}),
    iat,
    exp,
  };

  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(fullPayload));
  const data = `${encHeader}.${encPayload}`;
  const sig = sign(data, secret);

  return `${data}.${sig}`;
}

export function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
  ttlSeconds: number
) {
  return createToken(payload, ttlSeconds, "access");
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return createToken(payload, ACCESS_TOKEN_TTL_SECONDS, "access");
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return createToken(payload, REFRESH_TOKEN_TTL_SECONDS, "refresh", {
    jti: payload.jti,
  });
}

export function verifyToken(token: string, type: "access" | "refresh" = "access"): SessionPayload | null {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = sign(data, secret);

  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(s);
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64url(p)) as SessionPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  const tokenType = payload.tokenType ?? "access";
  if (type === "refresh" && tokenType !== "refresh") return null;
  if (type === "access" && tokenType === "refresh") return null;

  return payload;
}

export function verifySessionToken(token: string): SessionPayload | null {
  return verifyToken(token, "access");
}
