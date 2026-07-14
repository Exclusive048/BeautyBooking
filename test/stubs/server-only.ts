// VITEST-SERVER-ONLY-SHIM (2026-07-07) — test-only stub for the `server-only`
// npm package.
//
// The real package is a build-time marker: its export map resolves the
// `react-server` condition to an empty no-op and everything else to a module
// that THROWS at import ("This module cannot be imported from a Client Component
// module."). That throw is intentional — it enforces the server/client boundary
// (CLAUDE.md rule 13) in the webpack client bundle. But vitest runs in a plain
// node env with no `react-server` condition, so any server module that does
// `import "server-only"` (prisma / redis / schedule / admin-cabinet services…)
// fails at IMPORT time under the test runner.
//
// vitest.config.ts aliases `server-only` → this empty module so those imports
// are a no-op in tests ONLY. The alias lives exclusively in the vitest config;
// next.config.ts / tsconfig / `npm run build` are untouched, so the real
// package keeps throwing in the production client bundle.
export {};
