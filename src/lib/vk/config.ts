// VK ID OAuth config. Reads creds via `env` (Zod-validated) — NOT process.env —
// so both the canonical `VK_*` names and the `VK_ID_*` aliases pass validation
// (VK_ID_*-SCHEMA-GAP fix). Precedence is alias-first then canonical, unchanged
// from before; behaviour is identical, only the read-path is now validated.
// The client id itself is resolved in `env.ts` (`vkClientId`) and re-exported
// here, so `isVkAuthEnabled` gates on exactly what this resolver returns.
import { env, vkClientId } from "@/lib/env";

const CLIENT_SECRET_VALUES = [env.VK_ID_CLIENT_SECRET, env.VK_CLIENT_SECRET] as const;
const REDIRECT_URI_VALUES = [env.VK_ID_REDIRECT_URI, env.VK_REDIRECT_URI] as const;

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(values: readonly (string | undefined)[]): string | null {
  for (const value of values) {
    const normalized = normalize(value);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * VK-CLIENT-ID-ALIAS-GATE-MISMATCH: the resolution now lives in `env.ts` so the
 * kill-switch (`isVkAuthEnabled`) and this resolver can never disagree about
 * whether VK is configured. Same alias-first precedence as before.
 */
export function getVkClientId(): string | null {
  return vkClientId;
}

export function getVkClientSecret(): string | null {
  return firstNonEmpty(CLIENT_SECRET_VALUES);
}

export function getVkRedirectUri(): string | null {
  return firstNonEmpty(REDIRECT_URI_VALUES);
}
