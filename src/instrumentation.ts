/**
 * OBSERVABILITY-GLITCHTIP-01 — Next.js server instrumentation hook.
 *
 * Next 16 calls `register()` once per server runtime at boot, and
 * `onRequestError` for every error that escapes a route handler, a server
 * action or a render. Together they are the whole server-side capture surface —
 * no route wrapping, no `next.config` changes.
 *
 * ── Why `@sentry/node` and not `@sentry/nextjs` ──────────────────────────────
 * `@sentry/nextjs` exists to add build-time machinery on top of the same SDK:
 * a `withSentryConfig` wrapper, a webpack plugin, source-map upload, a tunnel
 * route, and OpenTelemetry auto-instrumentation. Against a GlitchTip backend
 * every one of those is either unusable or unwanted:
 *   · source-map upload needs an auth token + a release pipeline → DevOps work,
 *     deliberately deferred (see BACKLOG);
 *   · the tunnel route only matters for ad-blocker evasion on a Sentry.io host;
 *   · tracing is off, so the OTel instrumentation is pure overhead;
 *   · `next.config.ts` here already stacks `withBundleAnalyzer` + `withPWA`
 *     over a custom webpack config, on a pre-launch branch. A fourth wrapper is
 *     build risk bought for nothing.
 * Using `@sentry/node` + `@sentry/browser` directly keeps the build pipeline
 * byte-identical and gives one SDK family across all three runtimes, including
 * the worker — which `@sentry/nextjs` could not serve anyway.
 *
 * ⚠️ `process.env.NEXT_RUNTIME` is read as a literal on purpose. Next inlines
 * it per-runtime build, so the `nodejs` branch is dead-code-eliminated from the
 * EDGE bundle — which is what stops `@sentry/node` (and its Node built-ins)
 * from being pulled into the edge/middleware graph and failing the build. This
 * file is a runtime-boundary file like `src/proxy.ts`; see CLAUDE.md rule 11.
 */

import { reportError } from "@/lib/observability/report";

type RequestErrorRequest = Readonly<{
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}>;

type RequestErrorContext = Readonly<{
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "proxy";
  renderSource?: string;
  revalidateReason?: string;
}>;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic import: keeps `@sentry/node` out of the edge bundle entirely (the
  // guard above is eliminated at build time, and with it this import).
  const { initServerObservability } = await import("@/lib/observability/server");
  initServerObservability("next-server");
}

/**
 * Every uncaught server-side error, with its real stack. Handled 5xx responses
 * are reported separately from `fail()` in `src/lib/api/response.ts`, where the
 * error has already been converted into an API response.
 *
 * Never awaited by Next in a way that blocks the response, and `reportError`
 * is a no-op when tracking is inactive.
 */
export function onRequestError(
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext
): void {
  // Query strings carry OTP-adjacent and OAuth material; the path alone is
  // enough to locate the failure.
  const path = typeof request?.path === "string" ? request.path.split("?")[0] : undefined;

  reportError(error, {
    level: "error",
    tags: {
      route_path: context?.routePath,
      route_type: context?.routeType,
      router_kind: context?.routerKind,
      render_source: context?.renderSource,
      http_method: request?.method,
    },
    // Headers are intentionally not forwarded — they carry the session cookie
    // and Authorization.
    extra: { path },
  });
}
