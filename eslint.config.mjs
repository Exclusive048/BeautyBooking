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
  // GUARDRAILS-01 (H1 overlays): a hand-rolled `fixed inset-0` modal/overlay
  // surface breaks whenever an ancestor gains transform/filter/overflow — the
  // recurring positioning class (4th recurrence 2026-07-03). Route overlays
  // through <ModalSurface> / <Drawer> (createPortal to <body>). warn-level so it
  // never breaks the lint baseline on pre-existing uses; flags NEW ones for review.
  {
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/fixed inset-0|fixed top-0 left-0 right-0 bottom-0/]",
          message:
            "Overlay/modal surfaces must portal through <ModalSurface> or <Drawer> (createPortal to body). A hand-rolled `fixed inset-0` breaks when an ancestor has transform/filter/overflow. See docs/QUALITY-GATES.md modal-positioning + CLAUDE.md rule 13. Genuinely non-modal fixed overlays (nav backdrops, click-catchers) are exempted per-file in eslint.config.mjs.",
        },
        {
          selector: "TemplateElement[value.raw=/fixed inset-0|fixed top-0 left-0 right-0 bottom-0/]",
          message:
            "Overlay/modal surfaces must portal through <ModalSurface> or <Drawer> (createPortal to body). A hand-rolled `fixed inset-0` breaks when an ancestor has transform/filter/overflow. See docs/QUALITY-GATES.md modal-positioning + CLAUDE.md rule 13. Genuinely non-modal fixed overlays (nav backdrops, click-catchers) are exempted per-file in eslint.config.mjs.",
        },
      ],
    },
  },
  // Exemptions — explicit + justified. Two categories:
  //  (1) sanctioned overlay PRIMITIVES that DO portal to body;
  //  (2) genuinely non-modal fixed overlays (mobile-nav scrims, invisible
  //      click-outside catchers) — not content modals, portaling adds nothing.
  // Genuine content-overlay candidates (city-prompt-overlay, portfolio-editor
  // crop, portfolio-strip lightbox, reviews-preview, stories-viewer-overlay) are
  // intentionally NOT exempted — they warn as follow-up candidates (GUARDRAILS-01
  // did not refactor them; see report / backlog).
  {
    files: [
      "src/components/ui/modal-surface.tsx", // THE portal modal primitive
      "src/components/ui/drawer.tsx", // sanctioned portal drawer primitive
      "src/components/layout/bottom-nav.tsx", // mobile-nav backdrop (lg:hidden)
      "src/features/master/components/master-bottom-nav.tsx", // mobile-nav backdrop
      "src/features/studio-cabinet/components/studio-bottom-nav.tsx", // mobile-nav backdrop
      "src/features/admin-cabinet/components/admin-sidebar-mobile.tsx", // mobile sidebar backdrop
      "src/features/master/components/portfolio/portfolio-card.tsx", // invisible click-catcher (z-10 cursor-default)
      "src/features/master/components/services/row-menu.tsx", // invisible click-catcher (z-10 cursor-default)
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
