/**
 * OBSERVABILITY-GLITCHTIP-01 — shared configuration resolved from `env.ts`.
 *
 * All values go through `env` (CLAUDE.md rule 11) — never `process.env`. The
 * vars are named `GLITCHTIP_*` rather than `SENTRY_*` on purpose: the Sentry
 * SDK silently falls back to `SENTRY_DSN` / `SENTRY_ENVIRONMENT` /
 * `SENTRY_RELEASE` from the raw environment, which would be an env read that
 * bypasses the Zod schema. With `GLITCHTIP_*` names there is exactly one path
 * into the SDK: the options object built here.
 *
 * Client-safe — `env.ts` is evaluated in the browser bundle too, and only the
 * `NEXT_PUBLIC_*` values are read on that side.
 */

import { env } from "@/lib/env";

export type ObservabilityConfig = {
  dsn: string;
  environment: string;
  release: string | undefined;
  sampleRate: number;
};

function trimmed(value: string | undefined): string | undefined {
  const out = typeof value === "string" ? value.trim() : "";
  return out.length > 0 ? out : undefined;
}

/**
 * Deployment name shown in GlitchTip. Defaults to `NODE_ENV` so a dev machine
 * that opts in is never confused with production.
 */
export function resolveEnvironmentName(): string {
  return trimmed(env.NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT) ?? env.NODE_ENV ?? "development";
}

/**
 * Release identifier used to group events by deploy. Optional — GlitchTip
 * accepts events without one; readable stack traces from minified client code
 * additionally need source-map upload, which is deferred (see BACKLOG).
 */
export function resolveRelease(): string | undefined {
  return trimmed(env.NEXT_PUBLIC_GLITCHTIP_RELEASE);
}

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

/**
 * Browser config. Deliberately a SEPARATE var from the server DSN so the two
 * can point at different GlitchTip projects (frontend noise never buries
 * backend failures), and so enabling backend tracking does not automatically
 * ship a DSN to every visitor.
 */
export function resolveBrowserObservabilityConfig(): ObservabilityConfig | null {
  const dsn = trimmed(env.NEXT_PUBLIC_GLITCHTIP_DSN);
  if (!dsn) return null;
  return {
    dsn,
    environment: resolveEnvironmentName(),
    release: resolveRelease(),
    sampleRate: 1,
  };
}
