import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated PWA artifacts:
    "public/sw.js",
    "public/workbox-*.js",
    // NAVBAR-REDESIGN-A: design references live here as standalone
    // .js/.jsx sketches (no transpile, no project imports). They
    // shouldn't show up in lint — they're not application code.
    // This closes the 858/134 ↔ 823/122 drift that crept in as the
    // references folder grew.
    ".claude/**",
  ]),
]);

export default eslintConfig;
