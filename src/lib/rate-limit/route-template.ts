/**
 * SEC-03 — превращает конкретный URL в шаблон роута для ключа рейт-лимита.
 *
 * Ключ прокси-лимита строился как `rl:<tier>:<ip>:<method>:<pathname>`, где
 * `pathname` содержал ЗНАЧЕНИЯ динамических сегментов. Значит
 * `/api/public/bookings/AAA` и `/api/public/bookings/BBB` — два разных ключа
 * Redis со своим счётчиком каждый, и перечислительная атака по id не
 * throttled вообще: на каждый id счётчик всегда 1.
 *
 * Нормализация идёт НЕ по форме значения («похоже на cuid»), а по составу
 * дерева роутов: сегмент, который не является литеральным сегментом
 * `src/app/api/**`, — динамический по построению. Это ловит не только
 * cuid/uuid, но и slug'и, коды и всё прочее, что формой не отличается от
 * обычного слова (`[slug]`, `[code]`, `[clientKey]`).
 *
 * Список ниже сгенерирован из дерева роутов и приколочен к нему guard-тестом
 * `route-template.test.ts`: новый литеральный сегмент, которого здесь нет,
 * валит тест с точным именем, которое нужно добавить. Забытая запись
 * деградирует БЕЗОПАСНО — сегмент схлопнется в `:id`, то есть роут разделит
 * ведро с соседями (лимит строже, не мягче).
 *
 * Взаимодействие, которое нельзя сломать: `isSensitiveRouteKey`
 * (`rate-limit/index.ts`) вытаскивает из ключа обратно `/api/...`-путь и
 * сверяет его с `SENSITIVE_ROUTE_PREFIXES` (инв. #6, fail-closed). Все эти
 * префиксы состоят только из литеральных сегментов, поэтому схлопывание
 * динамических значений их не задевает — `/api/bookings/<cuid>/cancel`
 * остаётся `/api/bookings/:id/cancel`. Это пиннится тестом.
 */
const API_STATIC_SEGMENTS: ReadonlySet<string> = new Set([
  "accept", "account", "account-type", "add", "address",
  "admin", "advisor", "analytics", "api", "app-settings",
  "applications", "apply", "approve", "assign-master",
  "at-risk", "attachment", "attention", "auth", "auto-publish-stories", "auto-renew",
  "autocomplete", "availability", "available-today", "billing", "block", "blocks",
  "book", "booking-config", "booking-days", "booking-options", "bookings", "broken",
  "buffer", "by-master", "by-photo", "by-service", "cabinet",
  "calendar", "callback", "can-leave", "cancel", "card",
  "catalog", "catalog-presence", "categories", "category", "center", "charts",
  "chat", "checkout", "cities", "classification", "clear-read",
  "client-ip", "clients", "close", "cohorts", "config", "confirm", "consents", "context",
  "conversations", "crop", "dashboard", "day", "decline-reschedule",
  "delete", "detail", "devices", "diagnostics", "disable", "dismiss", "duplicates", "email",
  "events", "exchange", "export", "favorite", "favorites", "feed",
  "file", "forecast", "free-slots", "funnel", "geocode",
  "global-categories", "health", "heatmap", "home", "hot-slots",
  "ics", "integrations", "invite", "invites", "kpis", "lead-time",
  "leave-studio", "link", "link-intent", "log-error", "login", "logout",
  "login-init", "ltv", "manage", "marketing", "master", "masters",
  "me", "media", "members", "merge", "messages", "mobile",
  "model-applications", "model-offers", "move", "mrr", "my",
  "my-proposals", "new-vs-returning", "notifications", "oauth", "og", "onboarding",
  "openapi", "otp", "overrides", "overview", "package", "packages", "palette",
  "partnership", "pattern", "payments", "photos", "plan", "plans",
  "portfolio", "preview", "professional", "profile", "profiles", "propose",
  "propose-time", "provider", "providers", "public", "public-username",
  "push", "queue", "read", "read-all", "ready", "recent-masters",
  "refresh", "refund", "reindex", "reject", "remove",
  "renew", "reorder", "reply", "report", "reports", "request",
  "request-verify", "requests", "resend", "reschedule", "reschedule-context", "resolve", "retention",
  "revenue", "review", "review-summary", "reviews", "revoke-others", "roles",
  "rule", "run", "schedule", "schedule-requests", "search", "seen",
  "segments", "service-packages", "services", "sessions", "set", "setup-guide",
  "settings", "slots", "snapshot", "start", "stats",
  "status", "stories", "stream", "studio", "studios",
  "subscribe", "subscriptions", "suggest", "suggest-description",
  "suggest-reply", "support", "system-config", "tags", "team", "telegram",
  "threads", "tickets", "time-slots", "timeline",
  "toggle", "unassign-master", "unlink", "unread-count", "unsubscribe",
  "upload-attachment", "upload-reference", "user", "users", "v1", "verify",
  "visual-search", "vk", "vk-community", "webhook", "week", "welcome", "worker",
  "yandex", "yookassa",
]);

/** Заглушка, в которую схлопывается любой нелитеральный сегмент. */
export const DYNAMIC_SEGMENT_PLACEHOLDER = ":id";

/** Только для guard-теста: сверка списка с реальным деревом роутов. */
export const API_STATIC_SEGMENTS_FOR_TESTS = API_STATIC_SEGMENTS;

/**
 * `/api/public/bookings/cmxyz.../items` → `/api/public/bookings/:id/items`.
 *
 * Не-`/api`-пути возвращаются как есть: тир для них не резолвится
 * (`resolveRateLimitTier`), так что нормализовать нечего.
 */
export function toApiRouteTemplate(pathname: string): string {
  if (!pathname.startsWith("/api/") && pathname !== "/api") return pathname;

  // Пустые сегменты отбрасываются, а не схлопываются: иначе `/api//bookings`
  // и `/api///bookings` дали бы разные ключи — тот же обход, только через
  // лишние слэши.
  const normalized = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      API_STATIC_SEGMENTS.has(segment) ? segment : DYNAMIC_SEGMENT_PLACEHOLDER,
    );

  return `/${normalized.join("/")}`;
}
