export const home = {
  accountDeleted: "Ваш аккаунт удалён",
  visualSearch: {
    button: "Найти по фото",
    modalTitle: "Найти по фото",
    modalSubtitle: "Покажите фото — найдём похожие работы",
    previewAlt: "Предпросмотр",
    resultPhotoAltTemplate: "Похожая работа — {provider} № {n}",
    dropzoneTitle: "Покажите фото — найдём похожие работы",
    dropzoneRelease: "Отпустите файл",
    dropzoneSubtitle: "или выберите файл",
    chooseFile: "Выбрать фото",
    changeFile: "Сменить фото",
    fileRequirements: "JPEG, PNG или WebP до 5 МБ",
    analyzing: "Ищем похожие работы…",
    searchingCategory: "Ищем похожие работы: {category}",
    noResultsTitle: "Мастера не найдены",
    noResultsSubtitle: "Попробуйте загрузить другое фото",
    actions: {
      startSearch: "Найти похожие работы",
      book: "Записаться",
      profileUnavailable: "Профиль недоступен",
    },
    messages: {
      unrecognized: "Не поняли, что на фото. Попробуйте другое.",
      lowConfidence:
        "Фото получилось нечётким. Попробуйте снимок крупнее и при хорошем свете.",
      notEnoughIndexed: "Пока мало работ в этой категории — попробуйте позже.",
      disabled: "Поиск по фото временно недоступен.",
      fileRequired: "Выберите файл изображения.",
      invalidFile: "Подойдёт фото JPEG, PNG или WebP до 5 МБ.",
      rateLimited: "Слишком часто. Попробуйте через минуту.",
      // SEC-04 п.7: суточный бюджет инстанса исчерпан — деградация честная
      // (429 + Retry-After до конца UTC-суток), не 500.
      budgetExhausted: "Поиск по фото на сегодня закончился. Попробуйте завтра.",
      // error-hint-ok: отказал провайдер поиска по фото — сразу повторять бесполезно, «позже» точнее
      searchFailed: "Не удалось выполнить поиск. Попробуйте позже.",
      // VISUAL-SEARCH-TRANSIENT-01: отказал провайдер, а не «на фото ничего нет».
      unavailable: "Не удалось разобрать фото — сервис сейчас не отвечает. Попробуйте ещё раз.",
    },
  },
  rebook: {
    title: "Записаться снова",
    bookAgain: "Записаться",
    lastVisit: "Последний визит",
    nextSlot: "Ближайшее окошко",
    noSlots: "Свободных окошек нет",
  },
  categories: {
    title: "Популярные категории",
    subtitle: "Найдите мастера под вашу задачу",
    showAll: "Смотреть всех",
  },
  hotSlotsPreview: {
    title: "Горящие окошки",
    subtitle: "Скидки до конца дня — свободные окошки прямо сейчас",
    book: "Записаться",
    showAll: "Все окошки",
    discountPercent: (v: number) => `-${v}%`,
    discountFixed: (v: number) => `-${v} ₽`,
  },
} as const;
