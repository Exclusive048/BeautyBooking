/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
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
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "supabase-storage",
        expiration: {
          maxEntries: 60,
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
  ],
  images: {
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
  allowedDevOrigins: ["https://beautyhub.art", "https://www.beautyhub.art"],
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
  }
};

module.exports = withPWA(nextConfig);
