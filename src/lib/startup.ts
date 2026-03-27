import { validateEnv } from "@/lib/env";

const shouldSkipDbStartup =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test";

if (!shouldSkipDbStartup) {
  validateEnv();
}
