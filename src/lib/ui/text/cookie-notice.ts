// RKN-FIX-06: an informational NOTICE, not a consent form. The census found
// every cookie here technically necessary and no analytics anywhere, so the
// old «Принять / Отклонить» pair offered a choice over nothing. The copy now
// states what is actually stored; the single action only dismisses the notice.
export const cookieNotice = {
  regionLabel: "Уведомление об использовании cookie",
  title: "Файлы cookie",
  text: "Мы используем только технически необходимые cookie: вход в аккаунт, защита форм, выбранный город и это уведомление. Cookie для аналитики, рекламы и отслеживания не устанавливаем.",
  privacyLink: "Подробнее — в Политике конфиденциальности",
  acknowledge: "Понятно",
} as const;
