/**
 * OBSERVABILITY-GLITCHTIP-01 — Next.js client instrumentation hook.
 *
 * Next 16 runs this module before any application code in the browser, which is
 * early enough for the SDK's global `error` / `unhandledrejection` handlers to
 * catch failures during hydration.
 *
 * ⚠️ The SDK is loaded through a DYNAMIC import behind the DSN gate, not a
 * static one. A static import puts `@sentry/browser` in the always-loaded
 * `main` chunk — ~90KB shipped to every visitor on every page, including the
 * dev/CI case where no DSN exists and the SDK is never even initialised.
 * Gating on the build-time-inlined flag lets webpack split it into its own
 * async chunk that is requested only when a DSN is configured.
 *
 * Trade-off, stated plainly: with tracking ON the SDK now arrives a few
 * milliseconds after page start instead of synchronously, so an error thrown in
 * that window is missed. That is worth the bytes — the alternative taxes every
 * visitor of a marketplace whose visitors are mostly on mobile.
 *
 * `global-error.tsx` is unaffected: it reports through the dependency-free
 * facade in `observability/report.ts`, not through the SDK directly.
 */

import { isBrowserErrorTrackingEnabled } from "@/lib/env";

if (isBrowserErrorTrackingEnabled) {
  void import("@/lib/observability/browser")
    .then((mod) => mod.initBrowserObservability())
    .catch(() => {
      // Chunk failed to load (offline, blocked, stale deploy). Error tracking
      // is never a dependency — the page carries on without it.
    });
}
