// FIX-YANDEX-OAUTH — Yandex ID OAuth config, bespoke-parallel to src/lib/vk/config.ts.
// Reads creds via `env` (Zod-validated, CLAUDE.md rule 11) — NOT process.env.
// Kept as its own module so a future AUTH-PROVIDER-ABSTRACTION can unify
// VK + Yandex with minimal surgery.
import { env } from "@/lib/env";

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getYandexClientId(): string | null {
  return normalize(env.YANDEX_OAUTH_CLIENT_ID);
}

export function getYandexClientSecret(): string | null {
  return normalize(env.YANDEX_OAUTH_SECRET);
}

export function getYandexRedirectUri(): string | null {
  return normalize(env.YANDEX_OAUTH_REDIRECT_URI);
}
