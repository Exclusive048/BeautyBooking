import type { NextConfig } from "next";
import path from "path";
import withPWA from "next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
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
      urlPattern: /\/api\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60,
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

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["https://beautyhub.art", "https://www.beautyhub.art"],
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.devtool = "source-map";
    }

    return config;
  },
};

export default withPWAConfig(nextConfig);
