// Service worker — источник для @serwist/next (SEC-07, миграция с next-pwa).
// Компилируется отдельной webpack-веткой плагина в public/sw.js на `npm run build`;
// в dev PWA выключена (см. next.config.ts), стейл-SW на localhost чистят
// DevServiceWorkerReset + инлайн-скрипт в layout.tsx.
//
// Правила рантайм-кэша перенесены 1:1 из прежнего конфига next-pwa
// (next.config.ts до SEC-07) — история и обоснования каждого правила (SEC-22
// про удалённый Supabase, PERF-30 про /_next/image) живут в git-истории того
// файла и в снапшоте; здесь — только действующее состояние.
//
// Push-логика намеренно остаётся в отдельном public/sw-push.js (importScripts,
// как и при next-pwa): push-подписка живёт дольше SW-обновлений, и его же
// подключает прежний установленный sw.js у существующих клиентов.

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

// Без lib.webworker в tsconfig (dom+webworker конфликтуют): файлу от глобального
// scope нужен только манифест прекэша — типизируем ровно его.
declare const self: SerwistGlobalConfig &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  importScripts: ["/sw-push.js"],
  runtimeCaching: [
    {
      // Навигации всегда из сети: стейл-HTML ссылается на устаревшие chunk-id.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    {
      matcher: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: "google-fonts",
        plugins: [
          new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 }),
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },
    {
      // PERF-30: единственный путь картинок продукта — /_next/image?url=…&w=…&q=…
      // (расширение внутри query, общее правило ниже его не видит). Ответ
      // неизменяем по построению: url+w+q целиком задают содержимое.
      matcher: /\/_next\/image\?/i,
      handler: new StaleWhileRevalidate({
        cacheName: "next-image-cache",
        plugins: [
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 }),
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },
    {
      matcher: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "images-cache",
        plugins: [
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 }),
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },
  ],
  fallbacks: {
    // /offline прекэшируется через additionalPrecacheEntries (next.config.ts).
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
