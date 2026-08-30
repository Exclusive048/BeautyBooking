/**
 * OBSERVABILITY-GLITCHTIP-01 / ENV-SPLIT-01 — браузерная половина конфига.
 *
 * Выделена из `config.ts`: тот модуль обслуживал и сервер, и браузер через
 * общий `env.ts`, а после ENV-SPLIT-01 серверный env несёт `server-only` и в
 * клиентский бандл не проходит. Здесь — только `env.client.ts` (инлайнящиеся
 * `NEXT_PUBLIC_*`), импортируется из `browser.ts`; серверный резолвер остался
 * в `config.ts`.
 */

import { clientEnv } from "@/lib/env.client";

export type ObservabilityConfig = {
  dsn: string;
  environment: string;
  release: string | undefined;
  sampleRate: number;
};

export function trimmed(value: string | undefined): string | undefined {
  const out = typeof value === "string" ? value.trim() : "";
  return out.length > 0 ? out : undefined;
}

/**
 * Deployment name shown in GlitchTip. Defaults to `NODE_ENV` so a dev machine
 * that opts in is never confused with production.
 */
export function resolveEnvironmentName(): string {
  return (
    trimmed(clientEnv.NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT) ?? clientEnv.NODE_ENV ?? "development"
  );
}

/**
 * Release identifier used to group events by deploy. Optional — GlitchTip
 * accepts events without one; readable stack traces from minified client code
 * additionally need source-map upload, which is deferred (see BACKLOG).
 */
export function resolveRelease(): string | undefined {
  return trimmed(clientEnv.NEXT_PUBLIC_GLITCHTIP_RELEASE);
}

/**
 * Browser config. Deliberately a SEPARATE var from the server DSN so the two
 * can point at different GlitchTip projects (frontend noise never buries
 * backend failures), and so enabling backend tracking does not automatically
 * ship a DSN to every visitor.
 */
export function resolveBrowserObservabilityConfig(): ObservabilityConfig | null {
  const dsn = trimmed(clientEnv.NEXT_PUBLIC_GLITCHTIP_DSN);
  if (!dsn) return null;
  return {
    dsn,
    environment: resolveEnvironmentName(),
    release: resolveRelease(),
    sampleRate: 1,
  };
}
