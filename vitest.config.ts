import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // VITEST-SERVER-ONLY-SHIM: the `server-only` package throws at import in a
  // non-`react-server` env (its whole purpose), which breaks vitest for any
  // server module that imports it (GUARDRAILS-01 added it to prisma/redis/
  // schedule). Alias it to a local empty stub so those imports are a no-op in
  // TESTS ONLY. Exact-match regex so nothing else is aliased. This lives only in
  // the vitest config — next.config.ts / tsconfig / `npm run build` are
  // untouched, so the real package keeps enforcing the server/client boundary
  // (CLAUDE.md rule 13) in the production client bundle.
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    // worker_threads fail on Windows with native modules (sharp, prisma); forks is stable cross-platform
    pool: "forks",
    // Item 4 (vitest hygiene): `.qa/**` holds Playwright specs (own runner via
    // playwright.config.ts). Vitest was mis-collecting them → false file-level
    // failures. Keep vitest's defaults and exclude the Playwright harness.
    exclude: [...configDefaults.exclude, ".qa/**"],
  },
});
