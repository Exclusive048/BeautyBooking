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

  // General public API
  publicApi: { windowSeconds: 60, maxRequests: 120 },
} satisfies Record<string, RateLimitConfig>;
