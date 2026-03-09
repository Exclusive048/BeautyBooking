const CLIENT_ID_ENVS = ["VK_ID_CLIENT_ID", "VK_CLIENT_ID"] as const;
const CLIENT_SECRET_ENVS = ["VK_ID_CLIENT_SECRET", "VK_CLIENT_SECRET"] as const;
const REDIRECT_URI_ENVS = ["VK_ID_REDIRECT_URI", "VK_REDIRECT_URI"] as const;

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFirst(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function getVkClientId(): string | null {
  return normalize(readFirst(CLIENT_ID_ENVS));
}

export function getVkClientSecret(): string | null {
  return normalize(readFirst(CLIENT_SECRET_ENVS));
}

export function getVkRedirectUri(): string | null {
  return normalize(readFirst(REDIRECT_URI_ENVS));
}
