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
    // QA-PREP-02: gitignored throwaway QA captures — per-task diagnostic
    // scripts + smoke screenshots (.gitignore). Not application code; eslint
    // only sees them on a machine that ran a live-QA session, so linting them
    // adds environment-specific noise (unused-var warnings in ad-hoc .mjs/.mts
    // capture scripts) absent from CI/clean checkouts. The committed
    // `.qa/*.spec.ts` harness + helpers stay linted.
    ".qa/diagnostics/**",
    ".qa/screenshots/**",
  ]),
  // GUARDRAILS-01 (H1 overlays): a hand-rolled `fixed inset-0` modal/overlay
  // surface breaks whenever an ancestor gains transform/filter/overflow — the
  // recurring positioning class (4th recurrence 2026-07-03). Route overlays
  // through <ModalSurface> / <Drawer> (createPortal to <body>). warn-level so it
  // never breaks the lint baseline on pre-existing uses; flags NEW ones for review.
  {
    files: ["**/*.tsx"],
    rules: {
      // GUARD-INTEGRITY (2026-08-12): было `warn`, а `npm run lint` выходит 0 при
      // любом числе warning'ов — то есть правило, заведённое после ТРЁХ
      // рецидивов, не могло остановить четвёртый. Поднято до `error`
      // @probe что сломать: добавить `fixed inset-0` в `components/ui/header-block.tsx`
      //        наблюдалось: `13:27 error Overlay/modal surfaces must portal…`,
      //        `lint` exit 1. При `warn` тот же вход давал 15 problems и exit 0.
      // без чужих чисток: замер перед правкой — у этого правила **ноль**
      // срабатываний (все 14 warning'ов базы — это 9 no-unused-vars в тестах
      // и 5 NEXT163-LOCATION-ASSIGN), то есть базовая линия не затронута.
      "no-restricted-syntax": [
        "error",
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
  // Exemptions — explicit + justified. Three categories:
  //  (1) sanctioned overlay PRIMITIVES that DO portal to body;
  //  (2) genuinely non-modal fixed overlays (mobile-nav scrims, invisible
  //      click-outside catchers) — not content modals, portaling adds nothing;
  //  (3) full-bleed MEDIA VIEWERS that a card/edge primitive can't host — a
  //      centered ModalSurface always renders bordered-card chrome
  //      (border/bg-card/padding/max-width) and `cn` is a plain join (no
  //      tailwind-merge), so that chrome CANNOT be neutralized via className.
  //      Forcing these into ModalSurface would change the full-bleed viewing
  //      UX (framing/letterbox), violating the behavior-preserving mandate.
  // OVERLAY-PORTAL-REFACTOR-01: the three CARD-shaped candidates (city-prompt-
  // overlay, portfolio-strip lightbox, reviews-preview all-reviews) were
  // migrated to <ModalSurface> and no longer warn. The two FULL-BLEED viewers
  // below are exempted under category (3).
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
      // (3) full-bleed media viewers — card-modal primitive is the wrong shape:
      // stories ALREADY createPortals to body itself (no positioning hazard —
      // only the literal warns) + has a bespoke focus-trap + gesture nav (tap
      // zones / hold-to-pause / swipe-down dismiss / 5s auto-advance) that
      // conflicts with ModalSurface's backdrop + focus-trap — invariant #27.
      "src/features/home/components/stories-viewer-overlay.tsx",
      // full-bleed 90vw image preview on bg-black; ModalSurface's card chrome
      // (unneutralizable without tailwind-merge) would box/letterbox it and
      // change the viewing UX. Residual hazard (not yet portaled) tracked in
      // BACKLOG — OVERLAY-FULLBLEED-PORTAL-PRIMITIVE.
      "src/features/media/components/portfolio-editor.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
