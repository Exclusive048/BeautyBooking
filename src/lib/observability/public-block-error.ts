import { logError } from "@/lib/logging/logger";
import { reportError } from "@/lib/observability/report";

/**
 * Сбой секции публичной страницы (мастер / студия): секция показывает «Не
 * удалось загрузить блок», страница живёт дальше.
 *
 * Раньше обе обёртки выходили сразу при `isProduction` и писали `console.error`
 * только в dev — то есть ровно там, где секции падают у настоящих посетителей
 * (так прожил PWA-FIX-02: три секции профиля мастера не грузились на проде, и
 * ни лог, ни трекер этого не видели). Теперь — структурный лог и трекер всегда.
 */
export function reportPublicBlockError(
  surface: "public-profile" | "public-studio",
  blockName: string,
  error: unknown,
  sources: string[] = [],
): void {
  // `sources` — имена сервисов секции (29.09 доработки · 13: HTTP-адресов
  // больше нет, секции читают сервисы напрямую).
  logError("public.block.failed", {
    surface,
    block: blockName,
    sources,
    error: error instanceof Error ? error.message : String(error),
  });
  reportError(error, { tags: { surface, block: blockName }, extra: { sources } });
}
