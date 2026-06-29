import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
