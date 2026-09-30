export const notificationsCenter = {
  title: "Уведомления",
  subtitle: "Приглашения и всё важное по вашим записям — в одном месте.",
  invitesTitle: "Приглашения в студии",
  timelineTitle: "Что происходило",
  // `phoneRequired` removed (NOTIFICATIONS-REDESIGN-01): the invites card now
  // renders only when there ARE invites, and invites are matched by phone
  // server-side — so «добавьте телефон» was advice that could only ever show
  // to someone who had no invites to see. Its only caller is gone.
  emptyTimeline: "Здесь пока пусто — попробуйте другой раздел.",
  noActiveInvites: "Нет активных приглашений.",
  // NOTIFICATIONS-REDESIGN-01: filters were channel-based (Все/Мастер/Студия/
  // Система/Приглашения) and identical for every viewer — a pure client was
  // offered «Студия» and «Приглашения» tabs that could never hold anything.
  // Replaced with semantic type-groups; the page renders a pill only when the
  // viewer's role admits the group AND it actually has items.
  filters: {
    aria: "Какие уведомления показать",
    all: "Все",
    bookings: "Записи",
    reminders: "Напоминания",
    reviews: "Отзывы",
    promo: "Акции",
    billing: "Оплаты",
    studio: "Студия",
    models: "Модели",
    system: "Система",
  },
  onlyUnread: "Только непрочитанные",
  channels: {
    master: "Мастер",
    studio: "Студия",
    system: "Система",
  },
  bookingStatus: {
    confirmed: "Подтверждено",
    rejected: "Отклонено",
    cancelled: "Отменено",
    noShow: "Неявка",
  },
  // RESCHEDULE-CURRENT-TIME: текст уведомления заморожен на момент события,
  // а бронь могла быть перенесена — строка показывает живое время.
  currentTimeLabel: "Актуальное время",
  bookingActions: {
    resolveForConfirmFailed: "Не удалось подтвердить запись. Попробуйте ещё раз.",
    resolveForDeclineFailed: "Не удалось отклонить запись. Попробуйте ещё раз.",
    confirmSuccess: "Запись подтверждена",
    confirmFailed: "Не удалось подтвердить запись. Попробуйте ещё раз.",
    declineSuccess: "Запись отклонена",
    declineFailed: "Не удалось отклонить запись. Попробуйте ещё раз.",
  },
  emptyAll: "Уведомлений пока нет",
  emptyAllSub: "Здесь появятся уведомления о записях, отзывах и оплатах",
  emptyFilter: "Нет уведомлений в этой категории",
  showAll: "Показать все",
  markAllRead: "Прочитать все",
  markAllReadFailed: "Не удалось отметить уведомления. Попробуйте ещё раз.",
  invites: {
    // 29.09 · 01-а: название — в «ёлочках» и «командой»: студии часто
    // называются «Студия …», и «Студия Студия Ольги» выглядело ошибкой.
    titleTemplate: "Вас приглашают в команду «{name}»",
    titleNoName: "Вас приглашают в команду студии",
    accept: "Принять",
    reject: "Отклонить",
    accepting: "Принимаем…",
    rejecting: "Отклоняем…",
    studioProfile: "Профиль студии",
    actionFailed: "Не удалось выполнить действие. Попробуйте ещё раз.",
    networkError: "Сеть недоступна или сервер не отвечает",
    inactive: "Приглашение больше не активно.",
  },
} as const;
