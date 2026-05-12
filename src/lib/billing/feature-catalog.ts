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
    group: "Бронирование",
    appliesTo: "BOTH",
    uiOrder: 10,
    status: "active",
  },
  catalogListing: {
    kind: "boolean",
    title: "Размещение в каталоге",
    description: "Отображается в каталоге.",
    group: "Каталог",
    appliesTo: "BOTH",
    uiOrder: 20,
    status: "active",
  },
  pwaPush: {
    kind: "boolean",
    title: "PWA push-уведомления",
    description: "Push-уведомления в PWA.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 30,
    status: "active",
  },
  profilePublicPage: {
    kind: "boolean",
    title: "Публичная страница профиля",
    description: "Публичная страница профиля.",
    group: "Профиль",
    appliesTo: "BOTH",
    uiOrder: 40,
    status: "active",
  },
  onlinePayments: {
    kind: "boolean",
    title: "Онлайн-оплата",
    description: "Прием онлайн-платежей.",
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
    title: "Аналитика: Дашборд",
    description: "KPI, выручка по периодам и загрузка по дням недели.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 72,
    status: "active",
  },
  analytics_revenue: {
    kind: "boolean",
    title: "Аналитика: Выручка",
    description: "Детализация выручки по услугам и мастерам.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 74,
    status: "active",
  },
  analytics_clients: {
    kind: "boolean",
    title: "Аналитика: Клиенты",
    description: "Сегменты клиентов, выручка и удержание.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 76,
    status: "active",
  },
  analytics_booking_insights: {
    kind: "boolean",
    title: "Аналитика: Бронирования",
    description: "Воронка, lead-time и тепловая карта.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 78,
    status: "active",
  },
  analytics_cohorts: {
    kind: "boolean",
    title: "Аналитика: Когорты",
    description: "Retention и revenue-когорты.",
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
    title: "Финансовый отчет",
    description: "Базовый финансовый отчет.",
    group: "Аналитика",
    appliesTo: "BOTH",
    uiOrder: 81,
    status: "active",
  },
  notifications: {
    kind: "boolean",
    title: "Уведомления",
    description: "Доступ к настройкам и каналам уведомлений.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 85,
    status: "active",
  },
  tgNotifications: {
    kind: "boolean",
    title: "Уведомления в Telegram",
    description: "Отправка уведомлений в Telegram.",
    group: "Уведомления",
    appliesTo: "BOTH",
    uiOrder: 90,
    status: "active",
  },
  vkNotifications: {
    kind: "boolean",
    title: "Уведомления во VK",
    description: "Отправка уведомлений во VK.",
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
    appliesTo: "MASTER",
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
    title: "Лимит мастеров в команде",
    description: "Максимум мастеров в студии.",
    group: "Лимиты",
    appliesTo: "STUDIO",
    uiOrder: 170,
    status: "active",
  },
  maxPortfolioPhotosSolo: {
    kind: "limit",
    title: "Портфолио (мастер)",
    description: "Макс. фото в портфолио мастера.",
    group: "Лимиты",
    appliesTo: "MASTER",
    uiOrder: 180,
    status: "active",
  },
  maxPortfolioPhotosStudioDesign: {
    kind: "limit",
    title: "Портфолио студии",
    description: "Макс. фото в портфолио студии.",
    group: "Лимиты",
    appliesTo: "STUDIO",
    uiOrder: 190,
    status: "active",
  },
  maxPortfolioPhotosPerStudioMaster: {
    kind: "limit",
    title: "Портфолио мастера в студии",
    description: "Макс. фото на одного мастера.",
    group: "Лимиты",
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
