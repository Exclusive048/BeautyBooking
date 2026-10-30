import { scrubString } from "@/lib/observability/scrub";

/**
 * ALERT-CONTEXT-ALLOWLIST (D-02) — адрес страницы из клиентского отчёта об
 * ошибке (`POST /api/log-error`, его шлёт каждый error boundary) приводится к
 * ШАБЛОНУ пути до того, как попасть в лог: без источника, query и hash, а
 * значения динамических сегментов — именами (`/booking/manage/:token`).
 *
 * Раньше в лог (и оттуда в ops-чат Telegram) уходил `window.location.href`
 * целиком. Для страницы «Управлять записью» это действующий предъявительский
 * токен: кто держит ссылку, тот отменяет и переносит чужую запись 120 дней.
 * Решение GUEST-MANAGE-LINK держало токен в ПУТИ ровно затем, чтобы он не
 * оседал в логах, — а отчёт об ошибке клал в лог весь адрес. Тем же путём шли
 * id человека (`/clients/<id>`) и всё, что носит query (`?view=`, `?client=`,
 * `?mt=` — тоже подписанные токены).
 *
 * Шаблоны перечислены руками, но список не может молча отстать от страниц:
 * сторож `report-path.test.ts` выводит динамические страницы из дерева
 * `src/app` и требует, чтобы ни одно значение их сегментов не дошло до лога.
 * Всё, что не совпало с шаблоном, ещё проходит `scrubString` (подписанные
 * токены, телефоны, почта в пути).
 */
export const PAGE_PATH_TEMPLATES: readonly string[] = [
  "/booking/manage/:token",
  "/c/:username",
  "/clients/:id",
  "/models/:code",
  "/providers/:id",
  "/u/:username",
];

/** Длиннее путей продукта не бывает; остальное — мусор присланного запроса. */
const MAX_REPORTED_PATH_LENGTH = 300;

/** База для разбора относительных адресов; в результат не попадает. */
const PARSE_BASE = "http://report.invalid";

function applyTemplate(segments: string[], template: string): boolean {
  const parts = template.split("/");
  if (segments.length < parts.length) return false;
  const matches = parts.every((part, index) => part.startsWith(":") || part === segments[index]);
  if (!matches) return false;
  parts.forEach((part, index) => {
    if (part.startsWith(":")) segments[index] = part;
  });
  return true;
}

export function toReportedPagePath(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  let pathname: string;
  try {
    // Только путь: источник (свой домен) не нужен, query и hash — то место,
    // где ездят токены.
    pathname = new URL(rawUrl, PARSE_BASE).pathname;
  } catch {
    return undefined;
  }
  const segments = pathname.split("/");
  for (const template of PAGE_PATH_TEMPLATES) {
    if (applyTemplate(segments, template)) break;
  }
  const path = scrubString(segments.join("/"));
  return path.length > MAX_REPORTED_PATH_LENGTH ? `${path.slice(0, MAX_REPORTED_PATH_LENGTH)}…` : path;
}
