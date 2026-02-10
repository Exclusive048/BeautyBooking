const CLIENT_ID_ENV = "VK_CLIENT_ID";
const CLIENT_SECRET_ENV = "VK_CLIENT_SECRET";
const REDIRECT_URI_ENV = "VK_REDIRECT_URI";

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getVkClientId(): string | null {
  return normalize(process.env[CLIENT_ID_ENV]);
}

export function getVkClientSecret(): string | null {
  return normalize(process.env[CLIENT_SECRET_ENV]);
}

export function getVkRedirectUri(): string | null {
  return normalize(process.env[REDIRECT_URI_ENV]);
}
