import { appleAppSiteAssociationResponse } from "@/lib/mobile/app-links";

export const runtime = "nodejs";
// Значения — из env рантайма, а не сборки.
export const dynamic = "force-dynamic";

/**
 * MOBILE-POLISH — iOS Universal Links: файл без расширения, отдаётся как
 * `application/json`, без редиректов (`/u/*`, `/models/*`). Не настроено — 404.
 * Логика и решения — `lib/mobile/app-links.ts`.
 */
export function GET() {
  return appleAppSiteAssociationResponse();
}
