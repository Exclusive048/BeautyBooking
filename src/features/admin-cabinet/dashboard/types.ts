/**
 * Plain-data types for the admin dashboard. Shared across server services
 * (`./server/*`) and client components — only primitives, no Prisma models,
 * no React, no functions. Safe to import from either side of the RSC
 * boundary via `import type`.
 */

export type AdminKpiKey =
  | "registrations7d"
  | "bookings1d"
  | "activeSubs"
  | "revenueMonth";

/** Single KPI tile. Delta is pre-computed on the server so the client
 * doesn't need to know about previous periods. */
export type AdminKpi = {
  key: AdminKpiKey;
  /** Pre-formatted display value, e.g. "248", "1 412", "4.2 млн ₽". */
  valueText: string;
  /** Underlying numeric value (for tests / accessibility). */
  rawValue: number;
  /** Delta text without the arrow glyph, e.g. "+18%", "+24", or `null`
   * when previous period was zero / unavailable. */
  deltaText: string | null;
  /** Sign of the delta. `null` means delta unavailable; "zero" means no
   * change. */
  deltaSign: "positive" | "negative" | "zero" | null;
};

export type AdminKpis = {
  items: AdminKpi[];
};

export type AdminChartPoint = {
  /** ISO date (UTC, day-precision) — `2026-05-12`. */
  date: string;
  /** Pre-formatted label, e.g. "12", "сегодня". */
  label: string;
  count: number;
};

export type AdminChartSeries = {
  total: number;
  /** "+18% vs прошлая неделя", localised on the server. */
  deltaText: string | null;
  deltaSign: "positive" | "negative" | "zero" | null;
  points: AdminChartPoint[];
};

export type AdminCharts = {
  registrations: AdminChartSeries;
  bookings: AdminChartSeries;
};

/**
 * ADMIN-EVENTS-02 (2026-10-27, запрос владельца: «не видно ни действий, ни
 * имён, фамилий, нельзя подгрузить ещё»). Один тип — один источник событий;
 * порядок источников в выдаче задаёт `ADMIN_EVENT_TYPES` (`lib/event-categories.ts`).
 */
export type AdminEventType =
  | "booking"
  | "booking_cancel"
  | "registration"
  | "cabinet_created"
  | "subscription"
  | "payment"
  | "review"
  | "complaint"
  // MOBILE-POLISH (App Store 1.2): жалоба пользователя на контент.
  | "content_report"
  | "admin_action";

/** Группа событий — вкладка фильтра на странице «История событий». */
export type AdminEventCategory = "all" | "bookings" | "users" | "billing" | "reviews" | "admin";

export type AdminEventDotTone = "ok" | "new" | "sub" | "cancel" | "alert";

export type AdminEventAmountTone = "neutral" | "positive" | "negative";

/** Участник события: имя и фамилия полностью (без имени — телефон или почта). */
export type AdminEventPerson = {
  name: string;
  /** Подпись под именем: «клиент», «мастер», «студия», «администратор». */
  role: string | null;
  /** Карточка в админке (`/admin/users?q=<id>`); `null` — открыть нечего. */
  href: string | null;
};

export type AdminEventItem = {
  /** Composite `"{type}:{entityId}"` — stable across polls, used to
   * deduplicate client-side. */
  id: string;
  type: AdminEventType;
  /** ISO timestamp, server-side UTC. */
  timeIso: string;
  /** Unix ms — handy for `?since=` polling without re-parsing. */
  timeMs: number;
  /** Что произошло: «Новая запись», «Отмена клиентом», «Выдача тарифа». */
  action: string;
  /** Кто сделал. `null` — система. */
  actor: AdminEventPerson | null;
  /** Кого касается: мастер записи, автор отзыва, пользователь действия админа. */
  subject: AdminEventPerson | null;
  /** Подробности по пунктам: услуга, время визита, причина, комментарий. */
  details: string[];
  /** Right-column text — "3 500 ₽", "−2 200 ₽", "Открыта". `null` when not applicable. */
  amountText: string | null;
  amountTone: AdminEventAmountTone;
  dotTone: AdminEventDotTone;
};

export type AdminEventsResponse = {
  items: AdminEventItem[];
  /** Непрозрачный курсор `?before=` следующей страницы; `null` — старше нет. */
  nextCursor: string | null;
};

export type AdminHealthTone = "ok" | "warn" | "error" | "neutral";

export type AdminHealthSection = "platform" | "queue" | "integrations" | "moderation";

export type AdminHealthStat = {
  key:
    | "apiUptime"
    | "p95"
    | "errorRate"
    | "database"
    | "redis"
    | "process"
    | "worker"
    | "queuePending"
    | "queueProcessing"
    | "queueDead"
    | "realtime"
    | "email"
    | "push"
    | "payments"
    | "smsBalance"
    | "vk"
    | "aiSpend"
    | "complaintsOpen";
  /** ADMIN-HEALTH-02: группа строки на панели. */
  section: AdminHealthSection;
  valueText: string;
  tone: AdminHealthTone;
  /** Optional hint shown on hover — e.g. why a metric is "—". */
  hint?: string;
};

export type AdminHealth = {
  stats: AdminHealthStat[];
  /** Момент сборки снимка (ISO) — подпись «обновлено». */
  checkedAt: string;
};
