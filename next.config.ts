/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  importScripts: ["/sw-push.js"],
  runtimeCaching: [
    {
      urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
      // Avoid serving stale HTML that can reference outdated chunk/module ids.
      handler: "NetworkOnly",
      options: {},
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 8,
          maxAgeSeconds: 365 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // SEC-22: правило runtime-кэширования для `*.supabase.co/storage/...` удалено.
    // Supabase в проекте не используется (ноль упоминаний в `src/`), медиа идёт
    // через `storage.yandexcloud.net` либо локальный диск (`STORAGE_PROVIDER`).
    // Живого кода за правилом не было, но оно попадало в собранный `public/sw.js`
    // и вводило в заблуждение при чтении конфигурации.
    // PERF-30: оптимизированные картинки не попадали в кэш ВООБЩЕ. Правило
    // ниже судит по расширению В КОНЦЕ адреса, а `next/image` отдаёт всё через
    // `/_next/image?url=…&w=…&q=…` — расширение там внутри query, конец адреса
    // это параметр качества. То есть единственный путь, которым в продукте
    // едут картинки (§11 контекста: «изображения через next/image»), общим
    // правилом не покрывался, а специального правила ни для него, ни для
    // `storage.yandexcloud.net` не было — было мёртвое для Supabase (снято
    // SEC-22). Отдельное ведро, а не расширение общего: у оптимизатора свой
    // объём (один исходник × несколько ширин) и свой срок жизни — ответ
    // неизменяем по построению, потому что `url`+`w`+`q` целиком задают его
    // содержимое, и обновление картинки меняет сам `url`.
    {
      urlPattern: /\/_next\/image\?/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image-cache",
        expiration: {
          maxEntries: 120,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "images-cache",
        expiration: {
          maxEntries: 120,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
  fallbacks: {
    document: "/offline",
  },
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
  allowedDevOrigins: ["https://мастеррядом.online", "https://www.мастеррядом.online"],
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

module.exports = withBundleAnalyzer(withPWA(nextConfig));
