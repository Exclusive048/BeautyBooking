import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    // worker_threads fail on Windows with native modules (sharp, prisma); forks is stable cross-platform
    pool: "forks",
  },
});
