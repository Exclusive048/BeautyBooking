export type FeatureKind = "boolean" | "limit";
export type FeatureAppliesTo = "MASTER" | "STUDIO" | "BOTH";
export type FeatureStatus =
  | "active"    // implemented and gated in code
  | "planned";  // in roadmap, no code yet — cannot be enabled in plans

export type FeatureDefinition = {
  kind: FeatureKind;
  title: string;
  description: string;
  group: string;
  appliesTo: FeatureAppliesTo;
  uiOrder: number;
  status: FeatureStatus;
};

export const FEATURE_CATALOG = {
  onlineBooking: {
    kind: "boolean",
    title: "Онлайн-запись",
    description: "Запись клиентов через публичную страницу.",
    group: "Записи",
    appliesTo: "BOTH",
    uiOrder: 10,
    status: "active",
  },
  catalogListing: {
    kind: "boolean",
    title: "Размещение в каталоге",
    description: "Ваш профиль виден в каталоге.",
    group: "Каталог",
    appliesTo: "BOTH",
    uiOrder: 20,
    status: "active",
  },
  pwaPush: {
    kind: "boolean",
    title: "Уведомления на телефон",
    description: "Уведомления приходят прямо на телефон.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 30,
    status: "active",
  },
  profilePublicPage: {
    kind: "boolean",
    title: "Публичная страница профиля",
    description: "Ваша страница с портфолио, услугами и записью.",
    group: "Профиль",
    appliesTo: "BOTH",
    uiOrder: 40,
    status: "active",
  },
  onlinePayments: {
    kind: "boolean",
    title: "Онлайн-оплата",
    description: "Клиенты могут оплатить услугу онлайн.",
    group: "Платежи",
    appliesTo: "BOTH",
    uiOrder: 50,
    status: "active",
  },
  hotSlots: {
    kind: "boolean",
    title: "Горящие окошки",
    description: "Выделение свободных окошек со скидкой.",
    group: "Продвижение",
    appliesTo: "MASTER",
    uiOrder: 60,
    status: "active",
  },
  analytics_dashboard: {
    kind: "boolean",
    title: "Аналитика: Сводка",
    description: "Главные цифры, выручка по периодам и загрузка по дням недели.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 72,
    status: "active",
  },
  analytics_revenue: {
    kind: "boolean",
    title: "Аналитика: Выручка",
    description: "Выручка по каждой услуге и каждому мастеру.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 74,
    status: "active",
  },
  analytics_clients: {
    kind: "boolean",
    title: "Аналитика: Клиенты",
    description: "Новые и постоянные клиенты, выручка и кто возвращается.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 76,
    status: "active",
  },
  analytics_booking_insights: {
    kind: "boolean",
    title: "Аналитика: Записи",
    description: "Путь клиента до записи, за сколько дней записываются и в какие часы плотнее.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 78,
    status: "active",
  },
  analytics_cohorts: {
    kind: "boolean",
    title: "Аналитика: Возвращаемость",
    description: "Сколько клиентов возвращается и сколько приносит каждая группа.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 79,
    status: "active",
  },
  analytics_forecast: {
    kind: "boolean",
    title: "Аналитика: Прогноз",
    description: "Прогноз выручки на текущий месяц.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 80,
    status: "active",
  },
  financeReport: {
    kind: "boolean",
    // FIX-28 (PLAN-PARITY dead-gate): the dedicated finance report was never
    // shipped — the studio Finance page was removed (STUDIO-FINANCE-REMOVE-A)
    // and no surface reads `features.financeReport`. Marked `planned` (matches
    // maxNotifications/smsNotifications/clientImport) + dropped from all seed
    // plan grants so no tier advertises an unbuilt feature. Wire it back to a
    // tier only when a real finance report ships.
    title: "Финансовый отчёт",
    description: "Простой отчёт по деньгам.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 81,
    status: "planned",
  },
  notifications: {
    kind: "boolean",
    title: "Уведомления",
    description: "Настройка того, куда приходят уведомления.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 85,
    status: "active",
  },
  tgNotifications: {
    kind: "boolean",
    title: "Уведомления в Telegram",
    description: "Уведомления приходят в Telegram.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 90,
    status: "active",
  },
  vkNotifications: {
    kind: "boolean",
    title: "Уведомления в VK",
    description: "Уведомления приходят в VK.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 100,
    status: "active",
  },
  maxNotifications: {
    kind: "boolean",
    title: "Уведомления Max",
    description: "Отправка уведомлений в Max.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 110,
    status: "planned",
  },
  smsNotifications: {
    kind: "boolean",
    title: "SMS-уведомления",
    description: "Отправка SMS клиентам.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 120,
    status: "planned",
  },
  clientVisitHistory: {
    kind: "boolean",
    title: "История визитов клиента",
    description: "Доступ к истории визитов.",
    group: "Клиенты",
    appliesTo: "BOTH",
    uiOrder: 130,
    status: "active",
  },
  clientNotes: {
    kind: "boolean",
    title: "Заметки о клиенте",
    description: "Личные заметки по клиентам.",
    group: "Клиенты",
    // FIX-28 (PLAN-PARITY-clientNotes-appliesTo): studios genuinely use client
    // notes — STUDIO_PRO/PREMIUM grant it and the studio CRM card routes gate
    // on it via `canAccessClientCards` (`/api/studio/clients/[key]/card`). So
    // the catalog metadata now reflects real usage (was MASTER-only).
    appliesTo: "BOTH",
    uiOrder: 140,
    status: "active",
  },
  clientImport: {
    kind: "boolean",
    title: "Импорт клиентов",
    description: "Разовый импорт клиентской базы.",
    group: "Клиенты",
    appliesTo: "BOTH",
    uiOrder: 150,
    status: "planned",
  },
  highlightCard: {
    kind: "boolean",
    title: "Выделение карточки",
    description: "Выделение карточки в каталоге.",
    group: "Каталог",
    appliesTo: "BOTH",
    uiOrder: 160,
    status: "active",
  },
  maxTeamMasters: {
    kind: "limit",
    title: "Сколько мастеров в команде",
    description: "Максимум мастеров в студии.",
    group: "Объёмы",
    appliesTo: "STUDIO",
    uiOrder: 170,
    status: "active",
  },
  maxPortfolioPhotosSolo: {
    kind: "limit",
    title: "Портфолио (мастер)",
    description: "Сколько фото можно в портфолио мастера.",
    group: "Объёмы",
    appliesTo: "MASTER",
    uiOrder: 180,
    status: "active",
  },
  maxPortfolioPhotosStudioDesign: {
    kind: "limit",
    title: "Портфолио студии",
    description: "Сколько фото можно в портфолио студии.",
    group: "Объёмы",
    appliesTo: "STUDIO",
    uiOrder: 190,
    status: "active",
  },
  maxPortfolioPhotosPerStudioMaster: {
    kind: "limit",
    title: "Портфолио мастера в студии",
    description: "Сколько фото у каждого мастера студии.",
    group: "Объёмы",
    appliesTo: "BOTH",
    uiOrder: 200,
    status: "active",
  },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURE_CATALOG;

export type BooleanFeatureKey = {
  [Key in FeatureKey]: (typeof FEATURE_CATALOG)[Key]["kind"] extends "boolean" ? Key : never;
}[FeatureKey];

export type LimitFeatureKey = {
  [Key in FeatureKey]: (typeof FEATURE_CATALOG)[Key]["kind"] extends "limit" ? Key : never;
}[FeatureKey];
