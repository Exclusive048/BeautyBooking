// FIX-YANDEX-OAUTH — Yandex ID OAuth config, bespoke-parallel to src/lib/vk/config.ts.
// Reads creds from env. Kept as its own module so a future
// AUTH-PROVIDER-ABSTRACTION can unify VK + Yandex with minimal surgery.

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getYandexClientId(): string | null {
  return normalize(process.env.YANDEX_OAUTH_CLIENT_ID);
}

export function getYandexClientSecret(): string | null {
  return normalize(process.env.YANDEX_OAUTH_SECRET);
}

export function getYandexRedirectUri(): string | null {
  return normalize(process.env.YANDEX_OAUTH_REDIRECT_URI);
}
