import { env } from "@/lib/env";

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolvePublicAppUrl(requestUrl?: string): string | null {
  const envUrl =
    normalizeUrl(env.NEXT_PUBLIC_APP_URL) || normalizeUrl(env.APP_PUBLIC_URL);
  if (envUrl) return envUrl;
  if (!requestUrl) return null;

  try {
    const url = new URL(requestUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
