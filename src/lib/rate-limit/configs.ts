import type { RateLimitConfig } from "@/lib/rate-limit";

export const RATE_LIMITS = {
  // Aggressive actions
  bookingCreate: { windowSeconds: 60, maxRequests: 10 },
  reviewCreate: { windowSeconds: 60, maxRequests: 5 },
  mediaUpload: { windowSeconds: 60, maxRequests: 20 },
  modelOffer: { windowSeconds: 3600, maxRequests: 5 },
  modelApplication: { windowSeconds: 3600, maxRequests: 10 },

  // General mutation (cabinet POST/PATCH/DELETE)
  cabinetMutation: { windowSeconds: 60, maxRequests: 60 },

  // Destructive account/cabinet deletion
  destructiveDelete: { windowSeconds: 60 * 60, maxRequests: 1 },

  // AI-generated content
  aiReviewSummary: { windowSeconds: 60, maxRequests: 10 },
  aiSuggestReply: { windowSeconds: 3600, maxRequests: 20 },
  aiSuggestDescription: { windowSeconds: 3600, maxRequests: 20 },

  // General public API
  publicApi: { windowSeconds: 60, maxRequests: 120 },

  // SEC-04: анонимные прокси к ПЛАТНЫМ API Яндекса (геокодер и suggest). До
  // фикса их защищал только общий publicApi-тир (120/60с), то есть один IP мог
  // сжечь ~172 800 платных вызовов в сутки. Тир отдельный, потому что цена
  // запроса тут не в CPU, а в деньгах, и она не должна зависеть от того, как
  // когда-нибудь перенастроят общий публичный лимит.
  // Числа взяты от реального ритма ввода: suggest дебаунсится 220–300 мс и
  // отменяет предыдущий запрос, то есть один введённый адрес стоит ~10–20
  // запросов; 60/мин оставляет запас на три-четыре адреса подряд. Геокодер
  // дёргается только при ВЫБОРЕ подсказки — на порядок реже.
  addressSuggest: { windowSeconds: 60, maxRequests: 60 },
  addressGeocode: { windowSeconds: 60, maxRequests: 30 },

  // SEC-15: лента горячих слотов — самый дорогой анонимный обработчик:
  // вложенный цикл «провайдеры × услуги × до 14 дней» на каждый промах кэша.
  // Общий publicApi (120/мин) не отражает эту асимметрию, а варьируя `from`,
  // мимо кэша можно промахиваться намеренно.
  hotSlotsFeed: { windowSeconds: 60, maxRequests: 30 },

  // Payment-provider webhook ingress (YooKassa). Isolated from `publicApi` so a
  // future public-API tightening can't starve payment notifications. 300/min per
  // source IP is far above YooKassa's spaced retry cadence (it never floods a
  // single merchant's webhook), while still bounding a forged-notification burst.
  // The enqueue is cheap; the real authenticity is the worker's API re-fetch
  // (HARDENING-02). Still fail-closed on Redis outage (path in /api/payments).
  webhookIngress: { windowSeconds: 60, maxRequests: 300 },

  // Feed
  feedPortfolio: { windowSeconds: 60, maxRequests: 60 },
  feedStories: { windowSeconds: 60, maxRequests: 30 },
} satisfies Record<string, RateLimitConfig>;
