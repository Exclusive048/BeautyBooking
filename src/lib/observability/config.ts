/**
 * OBSERVABILITY-GLITCHTIP-01 / ENV-SPLIT-01 — СЕРВЕРНАЯ половина конфига.
 *
 * All values go through `env` (CLAUDE.md rule 11) — never `process.env`. The
 * vars are named `GLITCHTIP_*` rather than `SENTRY_*` on purpose: the Sentry
 * SDK silently falls back to `SENTRY_DSN` / `SENTRY_ENVIRONMENT` /
 * `SENTRY_RELEASE` from the raw environment, which would be an env read that
 * bypasses the Zod schema. With `GLITCHTIP_*` names there is exactly one path
 * into the SDK: the options object built here.
 *
 * Браузерная половина (`resolveBrowserObservabilityConfig`) — в
 * `config.client.ts`: серверный `env.ts` несёт `server-only`, и импорт отсюда
 * в браузерный граф ронял бы сборку. Тип и общие резолверы среды/релиза живут
 * там же (они читают только NEXT_PUBLIC_* и работают на обеих сторонах).
 */

import { env } from "@/lib/env";
import {
  resolveEnvironmentName,
  resolveRelease,
  trimmed,
  type ObservabilityConfig,
} from "@/lib/observability/config.client";

export { resolveEnvironmentName, resolveRelease };
export type { ObservabilityConfig };

function resolveSampleRate(): number {
  const raw = Number(env.GLITCHTIP_SAMPLE_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 1;
  return raw;
}

/**
 * Server / worker config. `null` when `GLITCHTIP_DSN` is unset — the caller
 * then never calls `Sentry.init`, so dev and CI run exactly as before.
 */
export function resolveServerObservabilityConfig(): ObservabilityConfig | null {
  const dsn = trimmed(env.GLITCHTIP_DSN);
  if (!dsn) return null;
  return {
    dsn,
    environment: resolveEnvironmentName(),
    release: resolveRelease(),
    sampleRate: resolveSampleRate(),
  };
}


