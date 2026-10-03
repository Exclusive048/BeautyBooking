/**
 * MOBILE-B2 — тексты push-уведомлений нативного приложения (FCM / APNs /
 * RuStore).
 *
 * 🔴 Только ОБЩИЕ формулировки по типу события: ни имён клиента и мастера, ни
 * телефона, ни адреса, ни услуги, ни текста сообщения. Push проходит через
 * сервисы Google / Apple / VK и показывается на заблокированном экране — всё
 * конкретное человек видит, открыв приложение. Подстановок здесь нет намеренно:
 * функция-шаблон в этом домене — уже повод остановиться. Сторож —
 * `notifications/native-push/payload.test.ts`.
 *
 * Домен серверный: читается только при сборке push-сообщения, в браузерный
 * бандл не попадает.
 */
const details = "Откройте, чтобы посмотреть подробности.";

export const nativePush = {
  details,
  booking: {
    created: "Новая запись",
    createdBody: "Посмотрите детали записи.",
    awaitingDecision: "Запись ждёт вашего подтверждения.",
    confirmed: "Запись подтверждена",
    rejected: "Запись отклонена",
    cancelled: "Запись отменена",
    changed: "Запись изменена",
    changedBody: "Проверьте время записи.",
    rescheduleRequested: "Запрос на перенос",
    rescheduleRequestedBody: "Клиент просит перенести запись.",
    rescheduleDeclined: "Перенос отклонён",
    rescheduleDeclinedBody: "Запись осталась на прежнем времени.",
    reminder: "Напоминание о записи",
    reminder24hBody: "До визита около суток.",
    reminder2hBody: "До визита около двух часов.",
    reviewPrompt: "Как прошёл визит?",
    reviewPromptBody: "Оставьте отзыв о визите.",
    noShow: "Визит отмечен как неявка",
  },
  chat: {
    message: "Новое сообщение",
    messageBody: "Откройте чат, чтобы прочитать.",
  },
  review: {
    left: "Новый отзыв",
    leftBody: "Посмотрите отзыв в приложении.",
    replied: "Ответ на отзыв",
    repliedBody: "На ваш отзыв ответили.",
    deleted: "Отзыв удалён",
  },
  studio: {
    inviteReceived: "Приглашение в студию",
    inviteAccepted: "Приглашение принято",
    inviteRejected: "Приглашение отклонено",
    memberLeft: "Мастер покинул студию",
    memberRemoved: "Вы больше не в студии",
    scheduleRequest: "Запрос на изменение графика",
    scheduleApproved: "График одобрен",
    scheduleRejected: "График не одобрен",
    disbanded: "Студия закрыта",
    scheduleEnding: "Расписание мастера заканчивается",
    scheduleEndingBody: "Продлите график, чтобы клиенты видели свободное время.",
  },
  schedule: {
    ending: "Расписание заканчивается",
    endingBody: "Продлите расписание, чтобы клиенты видели свободное время.",
  },
  model: {
    application: "Новая заявка",
    applicationBody: "Посмотрите заявку в приложении.",
    applicationRejected: "Заявка отклонена",
    timeProposed: "Предложено время",
    timeProposedBody: "Подтвердите время записи.",
    bookingCreated: "Запись по заявке",
    timeConfirmed: "Время подтверждено",
  },
  hotSlot: {
    available: "Горящее окошко",
    availableBody: "Есть свободное время со скидкой.",
    freed: "Освободилось окошко",
    freedBody: "Посмотрите свободное время.",
    published: "Горящее окошко опубликовано",
    booked: "Горящее окошко заняли",
    bookedBody: "На окошко записался клиент.",
    expiring: "Горящее окошко скоро сгорит",
    expiringBody: "До начала окошка около часа.",
  },
  stats: {
    weekly: "Итоги недели",
    weeklyBody: "Посмотрите статистику за неделю.",
  },
  category: {
    approved: "Категория одобрена",
    rejected: "Категория отклонена",
  },
} as const;
