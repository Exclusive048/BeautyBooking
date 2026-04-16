import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";

export const VK_ID_STATE_COOKIE = "vk_id_state";
export const VK_ID_VERIFIER_COOKIE = "vk_id_verifier";
export const VK_ID_STATE_TTL_SECONDS = 10 * 60;

function requireSigningSecret(): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new AppError("AUTH_JWT_SECRET is not configured", 500, "INTERNAL_ERROR");
  }
  return secret;
}

function createSignature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signVkCookieValue(value: string): string {
  const secret = requireSigningSecret();
  const signature = createSignature(value, secret);
  return `${value}.${signature}`;
}

export function readSignedVkCookieValue(value?: string | null): string | null {
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
