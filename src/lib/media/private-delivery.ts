import crypto from "crypto";
import { env } from "@/lib/env";

export const PRIVATE_MEDIA_TOKEN_QUERY_PARAM = "mt";
const PRIVATE_MEDIA_TOKEN_PURPOSE = "media-read";
const DEFAULT_PRIVATE_MEDIA_TOKEN_TTL_SECONDS = 5 * 60;
const MAX_PRIVATE_MEDIA_TOKEN_TTL_SECONDS = 15 * 60;

type PrivateMediaTokenPayload = {
  aid: string;
  exp: number;
  purpose: typeof PRIVATE_MEDIA_TOKEN_PURPOSE;
};

function base64url(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buffer.toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getMediaDeliverySecret(): string {
  const explicitSecret = env.MEDIA_DELIVERY_SECRET?.trim();
  if (explicitSecret) return explicitSecret;

  if (env.NODE_ENV === "production") {
    throw new Error("MEDIA_DELIVERY_SECRET is required in production");
  }

  const authSecret = env.AUTH_JWT_SECRET?.trim();
  if (authSecret) return `media:${authSecret}`;
  return "dev-media-delivery-secret";
}

function sign(data: string): string {
  return base64url(crypto.createHmac("sha256", getMediaDeliverySecret()).update(data).digest());
}

function verifySignature(data: string, signature: string): boolean {
  const expected = sign(data);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function parseTokenPayload(token: string): PrivateMediaTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  if (!verifySignature(encodedPayload, signature)) return null;

  let payload: PrivateMediaTokenPayload;
  try {
    payload = JSON.parse(fromBase64url(encodedPayload)) as PrivateMediaTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.aid !== "string" ||
    payload.aid.length === 0 ||
    typeof payload.exp !== "number" ||
    payload.purpose !== PRIVATE_MEDIA_TOKEN_PURPOSE
  ) {
    return null;
  }

  return payload;
}

export function createPrivateMediaDeliveryToken(input: {
  assetId: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(
    1,
    Math.min(input.ttlSeconds ?? DEFAULT_PRIVATE_MEDIA_TOKEN_TTL_SECONDS, MAX_PRIVATE_MEDIA_TOKEN_TTL_SECONDS)
  );
  const payload: PrivateMediaTokenPayload = {
    aid: input.assetId,
    exp: now + ttlSeconds,
    purpose: PRIVATE_MEDIA_TOKEN_PURPOSE,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyPrivateMediaDeliveryToken(token: string, expectedAssetId: string): boolean {
  const payload = parseTokenPayload(token);
  if (!payload) return false;
  if (payload.aid !== expectedAssetId) return false;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return false;
  return true;
}

export function buildPrivateMediaDeliveryUrl(assetId: string, token: string): string {
  const params = new URLSearchParams({ [PRIVATE_MEDIA_TOKEN_QUERY_PARAM]: token });
  return `/api/media/file/${assetId}?${params.toString()}`;
}
