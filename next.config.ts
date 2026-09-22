/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
// SEC-07 (AUDIT-CAMPAIGN-02 п.2): next-pwa → @serwist/next. next-pwa мёртв с
// 2022 и тянул уязвимую вендоренную цепочку workbox 6 (5 high в
// `npm audit --omit=dev`); serwist — поддерживаемый преемник на том же workbox.
// Правила рантайм-кэша и fallbacks переехали В ИСТОЧНИК сервис-воркера —
// src/app/sw.ts (у serwist runtimeCaching живёт в sw, не в конфиге).
const withSerwist = require("@serwist/next").default({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // PWA-RELOAD-01: дефолт serwist `reloadOnOnline: true` вешает на КАЖДУЮ
  // страницу `online → location.reload()`. Мобильная сеть и возврат PWA из фона
  // дёргают это событие постоянно — страница перезагружалась посреди ввода,
  // сбрасывая скролл и недописанные поля. Перезагрузка по возврату сети нужна
  // ровно одной странице — офлайн-заглушке, и она делает это сама
  // (`src/app/offline/page.tsx`).
  reloadOnOnline: false,
  // /offline — server-rendered маршрут, в манифест build-ассетов сам не попадает;
  // прекэшируем явно, иначе fallback в sw.ts нечем отдавать. revision меняется
  // каждым билдом — снапшот страницы обновляется на каждый деплой.
  additionalPrecacheEntries: [{ url: "/offline", revision: crypto.randomUUID() }],
});

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // Note: duplicate API calls in dev logs are caused by React StrictMode.
  // This does NOT happen in production builds.
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: [
    "redis",
    "@redis/client",
    "@prisma/client",
    "sharp",
    "@aws-sdk/client-s3",
    // OBSERVABILITY-GLITCHTIP-01: `@sentry/node` statically imports
    // `import-in-the-middle` (via @sentry/node-core's ESM-loader module), which
    // `require()`s Node's `path`. Webpack bundles that graph for the
    // `instrumentation` entry and fails with
    // `Module not found: Can't resolve 'path'` — the same class as the 'net'
    // failure in CLAUDE.md rule 13, and it breaks EVERY route, not just one.
    // Marking these external leaves them as runtime requires. Needed even
    // though `registerEsmLoaderHooks: false` disables the hooks at runtime:
    // the import is static, so the bundler sees it regardless of the flag.
    "@sentry/node",
    "import-in-the-middle",
    "require-in-the-middle",
  ],
  images: {
    // 🔁 Keep this host list in sync with
    // src/components/ui/image-host.ts → ALLOWED_REMOTE_IMAGE_HOSTS.
    // FocalImage degrades any host NOT listed here to a local placeholder
    // (QA-102-L1) — an unlisted host would otherwise make next/image throw
    // and break the whole route instead of just the one card.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.yandexcloud.net",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: [
    "https://masterryadom.ru",
    "https://www.masterryadom.ru",
  ],
  async redirects() {
    return [
      // /help/masters was the original master-only knowledge base. The page has
      // been merged into /help with master/studio tabs; preserve the URL via
      // 308 permanent redirect so external links and search engine cache update.
      {
        source: "/help/masters",
        destination: "/help?tab=master",
        permanent: true,
      },
    ];
  },
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
      },
      ...(isProd
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];

    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },

  // OBSERVABILITY-GLITCHTIP-01. `serverExternalPackages` above covers server
  // components and route handlers, but Next compiles `src/instrumentation.ts`
  // as its OWN entry with its own webpack config, and that entry ignores the
  // list. `@sentry/node` statically imports `import-in-the-middle`, which
  // `require()`s Node's `path` — so without this the instrumentation entry
  // fails to compile and EVERY route 500s (verified: `GET / 500`,
  // `Module not found: Can't resolve 'path'`). Same failure class as the 'net'
  // error in CLAUDE.md rule 13.
  //
  // Externalising leaves these as runtime `require()`s, which is correct: they
  // are Node-only packages that must never be bundled. Server-side only —
  // the client bundle uses `@sentry/browser`, which is bundler-safe.
  webpack: (config: { externals?: unknown[] }, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals ?? []),
        "@sentry/node",
        "@sentry/node-core",
        "import-in-the-middle",
        "require-in-the-middle",
      ];
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(withSerwist(nextConfig));
