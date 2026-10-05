import { assetLinksResponse } from "@/lib/mobile/app-links";

export const runtime = "nodejs";
// Значения — из env рантайма, а не сборки.
export const dynamic = "force-dynamic";

/**
 * MOBILE-POLISH — Android App Links: какие приложения открывают ссылки домена
 * (`/u/*`, `/models/*` — по intent-filter приложения). Не настроено — 404.
 * Логика и решения — `lib/mobile/app-links.ts`.
 */
export function GET() {
  return assetLinksResponse();
}
