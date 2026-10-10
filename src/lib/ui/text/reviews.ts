/**
 * Отзывы: список и жалоба (публичный профиль, кабинет мастера) и форма отзыва
 * (публичный профиль, «Мои записи», управление записью гостя). Отдельным
 * доменом, чтобы публичный профиль не вёз `master` (37 kB) и `clientCabinet`
 * (29 kB) ради двух веток — 29.09 доработки · 18.
 */
export const reviews = {
  report: "Пожаловаться",
  reportFailed: "Не удалось отправить жалобу. Попробуйте ещё раз.",
  reportedAt: "Жалоба отправлена",
  reportModalTitle: "Пожаловаться на отзыв",
  reportModalDesc: "Укажите причину. Мы рассмотрим жалобу и примем меры, если нарушение подтвердится.",
  reportReasonLabel: "Причина",
  reportCommentLabel: "Дополнительно (необязательно)",
  reportCommentPlaceholder: "Опишите проблему подробнее…",
  reportSubmit: "Отправить жалобу",
  reportReasonSpam: "Спам или реклама",
  reportReasonFake: "Фейковый отзыв",
  reportReasonOffensive: "Оскорбления",
  reportReasonInappropriate: "Неприемлемые фото или текст",
  reportReasonOther: "Другое",
  reportReasonPlaceholder: "— выберите причину —",
  form: {
    title: "Оставить отзыв",
    starAria: "{star} звёзд",
    publicTagsTitle: "Что понравилось больше всего (до 3 пунктов)",
    privateTagsTitle: "Что можно улучшить (до 3 пунктов)",
    privateTagsHint: "Эти отметки видит только мастер",
    tagsLoading: "Загружаем отметки…",
    tagsLimit: "Можно выбрать до {count}",
    textPlaceholder: "Расскажите, как прошла запись — это поможет другим клиентам",
    submit: "Отправить",
    sending: "Отправляем…",
    cancel: "Отмена",
    loadTagsFailed: "Не удалось загрузить отметки. Попробуйте ещё раз.",
    submitFailed: "Не удалось отправить отзыв. Попробуйте ещё раз.",
  },
} as const;
