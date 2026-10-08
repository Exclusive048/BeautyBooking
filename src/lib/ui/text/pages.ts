export const pages = {
  models: {
    title: "Предложения для моделей | МастерРядом",
    description:
      "Бесплатные и льготные процедуры для моделей от мастеров красоты. Стрижки, окрашивание, маникюр и другие услуги.",
    brand: "МастерРядом",
    heading: "Стать моделью",
    headingHighlight: "бесплатно",
    lead:
      "Мастера ищут моделей для практики и портфолио. Получите услугу бесплатно или со скидкой.",
    heroBadge: "Только у нас",
    heroStats: "Сотни предложений каждую неделю",
    cityLabel: "Город",
    cityPlaceholder: "Введите город",
    categoryLabel: "Категория",
    categoryAll: "Все категории",
    filterAll: "Все",
    submit: "Найти",
    empty:
      "Пока нет активных предложений.",
    emptyHint: "Попробуйте изменить фильтры или заходите позже — мастера регулярно добавляют новые предложения.",
    emptyFilteredHint: "Попробуйте выбрать другую категорию или сбросить фильтры.",
    emptyCta: "Перейти в каталог",
    cityFallback: "Город не указан",
    categoryFallback: "Категория",
    priceFree: "Бесплатно для модели",
    badgeFree: "Бесплатно для модели",
    badgeDiscount: "Скидка",
    applyAction: "Откликнуться",
    applyActionArrow: "Откликнуться →",
    ratingLabel: "★",
    paginationPrev: "← Назад",
    paginationNext: "Вперёд →",
    filterChipAriaLabel: "Фильтр по категории",
  },
  support: {
    // Page-level keys removed — see top-level UI_TEXT.support.* for new wrapper UI.
    // pages.support.form.* keys below stay untouched: they're consumed inside
    // <SupportPageClient> (production-ready form, not redesigned in this commit).
    form: {
      contactLabel: "Как с вами связаться",
      contactPlaceholder: "Телефон, почта или ник в Telegram",
      contactCustomAction: "Указать другой способ связи",
      contactAddAction: "Добавить способ связи",
      errorTitleRequired: "Укажите заголовок обращения.",
      errorDescriptionRequired: "Опишите проблему подробнее (минимум 20 символов).",
      errorTooManyRequests: "Слишком часто. Попробуйте через несколько минут.",
      errorSendFailed: "Не удалось отправить обращение. Попробуйте позже.",
      errorSendNetwork:
        "Не удалось отправить обращение. Проверьте соединение и попробуйте снова.",
      successTitle: "Обращение отправлено",
      successDescription:
        "Мы получили ваше сообщение и ответим в ближайшее время. Контакт для ответа — из вашего профиля.",
      successAction: "Создать новое обращение",
      typeLabel: "Тип обращения",
      typeBugLabel: "🐛 Сообщить об ошибке",
      typeBugDesc: "Что-то работает не так",
      typeSuggestionLabel: "💡 Предложение",
      typeSuggestionDesc: "Идея по улучшению",
      titleLabel: "Заголовок",
      titlePlaceholderBug: "Например: не могу подтвердить запись",
      titlePlaceholderSuggestion: "Например: добавить фильтр по времени",
      descriptionLabel: "Описание",
      descriptionPlaceholderBug:
        "Расскажите, что происходит и на каком шаге. Напишите, с телефона вы или с компьютера.",
      descriptionPlaceholderSuggestion:
        "Опишите идею подробно: зачем это нужно, как должно работать, кому поможет.",
      attachmentLabel: "Вложение",
      attachmentOptional: "(необязательно)",
      attachmentFileLabel: "📎 {fileName}",
      attachmentReplace: "Нажмите чтобы заменить",
      attachmentEmptyTitle: "Скриншот или запись экрана",
      attachmentEmptySubtitle: "PNG, JPG, GIF, MP4 — до 10 МБ",
      submitSending: "Отправляем…",
      submit: "Отправить обращение",
    },
  },
  offline: {
    title: "Нет подключения к интернету",
    subtitle: "Похоже, вы офлайн. Проверьте соединение и попробуйте снова.",
    reload: "Обновить страницу",
    back: "Назад",
  },
  /**
   * MAINTENANCE-PAGE-01 — страница «идут работы» (deploy/maintenance/index.html).
   * Рендерится nginx'ом вне Next, поэтому ключи отсюда НЕ импортируются, а
   * ЗЕРКАЛЯТСЯ в HTML; лок-степ держит `http/app-tier-topology.test.ts`.
   */
  maintenance: {
    title: "Обновляем приложение",
    status: "Идут работы",
    subtitle:
      "Ведутся работы по обновлению МастерРядом. Это займёт несколько минут — страница обновится сама, когда всё будет готово.",
    etaUnknown: "Обычно это занимает не больше пяти минут",
    etaUntilPrefix: "Ориентировочно до",
    etaUntilSuffix: "(МСК)",
    reload: "Обновить страницу",
    contactPrefix: "Если срочно —",
    apiMessage: "Идут работы по обновлению. Попробуйте через несколько минут.",
  },
  forbidden: {
    title: "Нет доступа",
    subtitle: "У вас нет доступа к этой странице.",
    goHome: "На главную",
    login: "Войти",
  },
  globalError: {
    title: "Что-то пошло не так",
    subtitle: "Что-то сломалось. Попробуйте обновить страницу.",
    retry: "Попробовать ещё раз",
    goHome: "На главную",
  },
  blog: {
    navLabel: "Блог",
    title: "Блог — МастерРядом",
    description:
      "Анонсы новых функций, обновления платформы и полезные материалы для мастеров и клиентов.",
    heroBadge: "Блог",
    heroTitle: "Новости и обновления",
    heroSubtitle: "Анонсы функций, гиды для мастеров и всё важное о платформе.",
    comingSoonTitle: "Блог скоро запустится",
    comingSoonSubtitle: "Пока готовим материалы — вот анонсы того, что выйдет первым.",
    comingSoonPosts: [
      {
        tag: "Анонс",
        title: "Горящие окошки: заполняйте расписание за часы до приёма",
        desc: "Публикуйте срочные окошки со скидкой — клиенты видят их в отдельной ленте и записываются мгновенно.",
        date: "Скоро",
      },
      {
        tag: "Обновление",
        title: "Онлайн-оплата записей через ЮKassa",
        desc: "Принимайте предоплату прямо в МастерРядом. Поддержка СБП, карт и автоплатежей.",
        date: "Скоро",
      },
      {
        tag: "Функция",
        title: "Переносим клиентов из YClients",
        desc: "Переходите на МастерРядом без потери данных — перенесите клиентов и историю визитов в один клик.",
        date: "Скоро",
      },
      {
        tag: "Гид",
        title: "Как настроить расписание: полный разбор",
        desc: "Недельный режим, цикличное расписание, шаблоны смен, особые дни и закрытое время.",
        date: "Скоро",
      },
    ],
  },
  giftCards: {
    navLabel: "Подарочные сертификаты",
    title: "Подарочные сертификаты — МастерРядом",
    description: "Подарочные сертификаты на услуги красоты. Скоро на МастерРядом.",
    heading: "Подарочные сертификаты",
    heroText:
      "Скоро вы сможете дарить сертификаты на любые услуги у мастеров МастерРядом. Именинница сама выберет мастера и запишется в удобное время.",
    plannedTitle: "Что планируется:",
    plannedItems: [
      "Сертификаты на фиксированную сумму",
      "Отправим на почту или в мессенджер",
      "Именной дизайн с текстом от вас",
      "Срок действия — 12 месяцев",
      "Принимается у любого мастера на платформе",
    ],
    footerText: "Подарочные сертификаты появятся совсем скоро.",
  },
  publicProfile: {
    notFoundTitle: "Профиль не найден | МастерРядом",
    studioDescriptionFallback:
      "Запись онлайн в студию «{name}». Услуги, цены, отзывы и свободные окна.",
    masterDescriptionFallback:
      "Запись онлайн к мастеру {name}. Услуги, цены, отзывы и свободные окна.",
    studioDescriptionNoName: "Запись онлайн в студию. Услуги, цены, отзывы и свободные окна.",
    masterDescriptionNoName: "Запись онлайн к мастеру. Услуги, цены, отзывы и свободные окна.",
    titleTemplate: "{name} — запись онлайн",
    nameFallback: "Мастер",
    studioNameFallback: "Студия",
    servicesDescriptionTemplate: "Услуги: {services}. Запись онлайн.",
    ogBookOnline: "Записаться онлайн",
    ogReviews: "отзывов",
    ogMaster: "Мастер",
    ogStudio: "Студия",
    debugReasons: {
      unpublished: "найден, но профиль не опубликован",
      aliasUnpublished: "найден алиас, но профиль не опубликован",
      invalid: "некорректный username",
      notFound: "username не найден",
      redirectAlias: "редирект по алиасу на",
    },
  },
  publicClient: {
    title: "Профиль клиента | МастерРядом",
    unavailable: "Публичный профиль клиента недоступен.",
  },
  publicBooking: {
    notFoundTitle: "Запись онлайн | МастерРядом",
    studioDescriptionFallback:
      "Запись онлайн в студию «{name}». Выберите услуги и свободное время.",
    masterDescriptionFallback:
      "Запись онлайн к мастеру {name}. Выберите услуги и свободное время.",
    studioDescriptionNoName: "Запись онлайн в студию. Выберите услуги и свободное время.",
    masterDescriptionNoName: "Запись онлайн к мастеру. Выберите услуги и свободное время.",
    titleTemplate: "{name} — запись онлайн",
    nameFallback: "Мастер",
    studioNameFallback: "Студия",
  },
  modelOffer: {
    notFoundTitle: "Предложение не найдено | МастерРядом",
    notFoundDescription: "Предложение для моделей недоступно или было закрыто.",
    titleTemplate: "{service} для моделей",
    descriptionTemplate: "Предложение от мастера {name}: {date} {start}-{end}.",
    backToOffers: "← Все предложения",
    masterLabel: "Мастер",
    masterProfileCta: "Профиль мастера →",
    // FIX-POLISH-01 (walkthrough #2): the offer carries a booking WINDOW (the
    // range of start-times the master can take you) and a separate service
    // DURATION. They used to share the «Длительность» row (window shown large,
    // duration in parens) — reading like a 6-hour appointment claiming 2 hours.
    // Split into two honest labels.
    bookingWindowLabel: "Окно записи",
    durationLabel: "Длительность услуги",
    priceLabel: "Стоимость",
    originalPriceLabel: "Обычная цена",
    requirementsTitle: "Требования к модели",
    requirementsEmpty: "Особых требований нет — подходит всем.",
    applyTitle: "Откликнуться на предложение",
    applySubtitle:
      "Загрузите 1–3 фото и расскажите о себе. Мастер рассмотрит заявку и свяжется с вами.",
    applyLoginPrompt: "Войдите, чтобы откликнуться",
    applyLoginCta: "Войти",
    applyPhotoLabel: "Фото для заявки",
    applyPhotoHint: "До 3 фото — обычные снимки с телефона подойдут",
    applyPhotoSelected: "Выбрано: {names}",
    applyNoteLabel: "Сообщение мастеру",
    applyNotePlaceholder: "Коротко расскажите о себе",
    applyConsentText: "Разрешаю съёмку и публикацию фото в портфолио мастера",
    applyConsentError: "Отметьте согласие на съёмку",
    applyPhotoError: "Добавьте 1–3 фото для заявки",
    applyDefaultError: "Не удалось отправить заявку. Попробуйте ещё раз.",
    applySubmitLoading: "Отправляем…",
    applySubmitCta: "Подать заявку",
    applySuccessTitle: "Заявка отправлена",
    applySuccessText: "Мастер рассмотрит её и свяжется с вами.",
    applySuccessLink: "Мои заявки →",
    closedTitle: "Предложение закрыто",
    closedText: "Это предложение уже закрыто. Посмотрите другие.",
    closedCta: "Смотреть все предложения",
  },
} as const;
