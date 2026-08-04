import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";

// FIX-YANDEX-OAUTH — signed state/verifier cookies, bespoke-parallel to
// src/lib/vk/cookies.ts (HMAC-SHA256 over AUTH_JWT_SECRET).

export const YANDEX_STATE_COOKIE = "yandex_oauth_state";
export const YANDEX_VERIFIER_COOKIE = "yandex_oauth_verifier";
export const YANDEX_STATE_TTL_SECONDS = 10 * 60;

function requireSigningSecret(): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new AppError("Не настроен AUTH_JWT_SECRET.", 500, "INTERNAL_ERROR");
  }
  return secret;
}

function createSignature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signYandexCookieValue(value: string): string {
  const secret = requireSigningSecret();
  const signature = createSignature(value, secret);
  return `${value}.${signature}`;
}

export function readSignedYandexCookieValue(value?: string | null): string | null {
  if (!value) return null;
  const secret = requireSigningSecret();
  const index = value.lastIndexOf(".");
  if (index <= 0) return null;
  const raw = value.slice(0, index);
  const signature = value.slice(index + 1);
  if (!signature) return null;
  const expected = createSignature(raw, secret);
  if (signature.length !== expected.length) return null;
  const ok = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return ok ? raw : null;
}
