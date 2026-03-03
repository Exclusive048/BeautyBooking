import type { NextConfig } from "next";
import path from "path";
import withPWA from "next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  importScripts: ["/sw-push.js"],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-cache",
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
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

const nextConfig: NextConfig = {
  serverExternalPackages: ["redis", "@redis/client"],
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

export default withPWAConfig(nextConfig);
