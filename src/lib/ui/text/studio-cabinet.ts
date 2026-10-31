import { pluralize } from "@/lib/utils/pluralize";

export const studioCabinet = {
  layout: {
    studioFallbackName: "Студия",
    publicUsernameHint: "Придумайте короткий адрес страницы — по нему клиенты вас найдут",
  },
  teamAdd: {
    title: "Добавить мастера",
    info: "Перейдите в раздел «Команда» для управления мастерами.",
    back: "Вернуться в Команду",
  },
  // SCHEDULE-PATTERNS-01 (этап 4): «График команды» — мастера студии × дни.
  scheduleTeam: {
    breadcrumb: "Студия · Расписание",
    title: "График команды",
    masterColumn: "Мастер",
    endingSoon: (date: string) => `Настроено до ${date}`,
    coverageLabel: "Работают",
    noCoverageAria: "никто не работает",
    prevAria: "Предыдущая неделя",
    nextAria: "Следующая неделя",
    todayCta: "Сегодня",
    setScheduleCta: "Задать график",
    rhythmCta: "График по очереди",
    settingsLink: "Настройки мастера",
    emptyTitle: "Нет активных мастеров",
    emptyHint: "Когда мастера примут приглашение, здесь появится их график.",
    loadError: "Не удалось загрузить график команды. Попробуйте ещё раз.",
    saveError: "Не удалось сохранить день. Попробуйте ещё раз.",
    retry: "Повторить",
    noSchedule: "График не настроен",
    rhythm: {
      title: "График по очереди",
      hint: "Один график нескольким мастерам. «По очереди» сдвигает их так, чтобы рабочие дни чередовались.",
      mastersLabel: "Мастера",
      presetLabel: "График",
      firstDayLabel: "Первый рабочий день",
      staggerLabel: "По очереди",
      staggerHint: "Второй мастер начинает, когда у первого выходные, и так далее.",
      autoExtendLabel: "Продлевать автоматически",
      endLabel: "До какого дня",
      // UX-PASS-01: конец раньше начала сервер отклоняет — говорим сразу.
      endBeforeStart: "Дата окончания не может быть раньше первого рабочего дня.",
      apply: "Применить",
      applying: "Применяем…",
      noMasters: "Выберите хотя бы одного мастера.",
      failed: (name: string) => `Не удалось применить график мастеру ${name}. Попробуйте ещё раз.`,
      coveragePreview: "Покрытие по дням",
    },
  },
  nav: {
    home: "Главная",
    calendar: "Календарь",
    team: "Команда",
    clients: "Клиенты",
    analytics: "Аналитика",
    billing: "Тарифы",
    settingsAria: "Настройки",
    ariaLabel: "Навигация студии",
    // NAV-PARITY-02: группы — как у кабинета мастера («Работа», «Клиенты»,
    // «Бизнес»; последняя — «Студия» вместо мастерского «Аккаунт»).
    groups: {
      work: "Работа",
      team: "Команда",
      clients: "Клиенты",
      business: "Бизнес",
      studio: "Студия",
    },
    items: {
      dashboard: "Главная",
      schedule: "Расписание",
      // STUDIO-SCHEDULE-SETTINGS-A: schedule-settings sidebar label.
      scheduleSettings: "Настройки расписания",
      // SCHEDULE-PATTERNS-01 (этап 4): доска смен команды.
      teamSchedule: "График команды",
      scheduleRequests: "Заявки",
      bookings: "Записи",
      masters: "Мастера",
      services: "Услуги",
      clients: "Клиенты",
      reviews: "Отзывы",
      notifications: "Уведомления",
      // STUDIO-CHAT: переписка с клиентами от имени студии.
      messages: "Сообщения",
      analytics: "Аналитика",
      billing: "Тариф",
      // Страница студии `/u/<адрес>` в новой вкладке — подпись как у мастера.
      publicPage: "Публичная страница",
      // Ссылка, QR-код и визитка страницы студии (`/cabinet/studio/settings/public`).
      myPage: "Моя страница",
      // HELP-GUIDE-01: инструкция по кабинету — `/help?tab=studio`.
      help: "Помощь",
      settings: "Настройки",
    },
  },
  appCaption: "КАБИНЕТ СТУДИИ",
  userChip: {
    currentContext: "{studio}",
  },
  bottomNav: {
    more: "Ещё",
    moreTitle: "Дополнительно",
    close: "Закрыть",
    // NAV-STUDIO-SETTINGS-TAB — вкладка раздела «Профиль» настроек студии.
    profile: "Профиль",
  },
  dashboard: {
    cards: {
      reviews: "Отзывы",
    },
  },
  // DASHBOARD-REORDER (запрос владельца 2026-10-31): главная студии —
  // сегодня, что ждёт действия, ближайшие записи и свободные окошки.
  // Показатели за 30 дней, топ мастеров и выручка — в аналитике.
  dashboardV2: {
    today: {
      bookings: (count: number) =>
        count > 0
          ? `Сегодня ${count} ${pluralize(count, "запись", "записи", "записей")}`
          : "Сегодня записей нет",
      onShift: (count: number, total: number) => `На смене ${count} из ${total}`,
    },
    attention: {
      title: "Требуют внимания",
      empty: "Всё под контролем — ничего не ждёт.",
      bookingsAwaiting: "Ждут подтверждения",
      unreadMessages: "Новые сообщения",
      reviewsUnanswered: "Отзывы без ответа",
      scheduleRequests: "Заявки на график",
    },
    upcoming: {
      title: "Ближайшие записи",
      subtitle: (shown: number, total: number) =>
        total > shown
          ? `Сегодня · ${shown} из ${total}`
          : `Сегодня · ещё ${total} ${pluralize(total, "запись", "записи", "записей")}`,
      toCalendar: "Весь календарь",
      empty: "На сегодня записей больше нет",
      awaitingBadge: "Ожидает",
    },
  },
  // STUDIO-SCHEDULE-SETTINGS-A Phase A — page text. Phase B will
  // add `breaks` / `exceptions` / `visibility` subtrees alongside.
  scheduleSettings: {
    breadcrumb: "Настройки расписания",
    title: "Настройки расписания",
    noMastersTitle: "Нет активных мастеров",
    noMastersHint:
      "Чтобы настроить расписание, добавьте в студию хотя бы одного мастера и допустите его к записи.",
    tabs: {
      calendar: "Календарь",
      rules: "Правила",
      breaks: "Перерывы",
      visibility: "Видимость",
    },
    masterPicker: {
      label: "Мастер",
      hint: "Всё, что ниже, — про выбранного мастера.",
    },
    rules: {
      // Правила всей студии живут в «Настройки» → «Правила студии»; здесь —
      // правила выбранного мастера. Окно записи на услугу студии — более
      // строгое из двух (BOOKING-WINDOW-STRICTER).
      studioRulesNote:
        "Здесь — правила выбранного мастера. Общие правила записи для всей студии задаются в настройках студии. При записи на услугу студии действует более строгий срок записи из двух.",
      studioRulesCta: "Открыть правила студии",
      minHoursTitle: "Минимум за",
      minHoursHint:
        "За сколько часов до визита клиент должен записаться.",
      maxDaysTitle: "Максимум за",
      maxDaysHint: "На сколько дней вперёд открыта запись.",
      autoConfirmTitle: "Автоподтверждение",
      autoConfirmHint:
        "Запись подтверждается автоматически без участия мастера.",
      freeCancelTitle: "Бесплатная отмена за",
      freeCancelHint:
        "За сколько часов до визита клиент может отменить бесплатно.",
      freeCancelToggleAria: "Включить бесплатную отмену",
      saveLabel: "Сохранить",
      savingLabel: "Сохраняем…",
      savedHint: "Правила сохранены.",
    },
    errors: {
      save: "Не удалось сохранить. Попробуйте ещё раз.",
    },
    // STUDIO-SCHEDULE-SETTINGS-A Phase B — Breaks tab. Mirrors the
    // master cabinet's «just buffer» version (the recurring-breaks
    // editor was rolled back — single source of truth is the
    // schedule editor itself).
    breaks: {
      bufferTitle: "Пауза между записями",
      bufferHint:
        "Сколько минут после каждой записи не принимать следующую — на уборку и подготовку.",
      minutesSuffix: "мин",
      recurringBreaksHint:
        "Регулярные перерывы (например, обед) задаются в окне «Настроить график» и в календаре. Здесь — только пауза между записями.",
      saveLabel: "Сохранить",
      savingLabel: "Сохраняем…",
      savedHint: "Настройка сохранена.",
    },
    // STUDIO-SCHEDULE-SETTINGS-A Phase B — Visibility tab.
    visibility: {
      // STUDIO-PAUSE-SPLIT-01: личную страницу мастера скрывает только он
      // сам; студия ставит мастера на паузу в разделе «Мастера».
      personalVisibilityNote:
        "Личную страницу мастера в каталоге включает и скрывает сам мастер. Чтобы мастер временно не принимал записи в студии, поставьте его на паузу в разделе «Мастера».",
      slotPrecisionTitle: "Точность времени",
      slotPrecisionHint:
        "Что видит клиент в каталоге: точное время, «сегодня свободно» или только даты.",
      slotPrecisionLabels: {
        exact: "Точное время",
        today_free: "Сегодня свободно",
        date_only: "Только дата",
      },
      visibleSlotDaysTitle: "Сколько окошек вперёд",
      visibleSlotDaysHint: "Сколько дней вперёд клиент видит свободные окошки.",
      acceptNewClientsTitle: "Принимает новых клиентов",
      acceptNewClientsHint:
        "Если выключить, новые клиенты не смогут записаться. Существующие — смогут.",
      saveLabel: "Сохранить",
      savingLabel: "Сохраняем…",
      savedHint: "Настройки видимости сохранены.",
    },
  },
  scheduleV2: {
    // SCHEDULE-FLEX-DATE-NAV: вид, стрелки, «Сегодня» и выбор даты — общий
    // `DateNavigator` (`UI_TEXT.schedule.dateNav`); подпись дня и сводка под
    // заголовком ушли — дату показывает навигатор, числа — показатели.
    header: {
      title: "Расписание студии",
      refresh: "Обновить",
      refreshedAtTemplate: "обновлено {time}",
      addBooking: "Добавить запись",
      // Вход в «График команды» прямо со вкладки «Расписание» — на телефоне
      // без похода в лист «Ещё» (как «Настроить расписание» у мастера).
      setupSchedule: "Настроить расписание",
      manageBreaks: "Перерывы",
      salonTimeNote: "Время студии",
    },
    breakDialog: {
      title: "Перерывы мастеров",
      subtitle: "Перерывы и закрытое время мастеров на этот день.",
      existingTitle: "Перерывы дня",
      addTitle: "Новый перерыв",
      masterLabel: "Мастер",
      startLabel: "Начало",
      endLabel: "Конец",
      noteLabel: "Подпись (необязательно)",
      notePlaceholder: "Обед",
      addButton: "Добавить",
      removeButton: "Удалить перерыв",
      cancel: "Закрыть",
      submitting: "Сохраняем…",
      empty: "На этот день перерывов нет.",
      noMasters: "Сегодня нет доступных мастеров",
    },
    legend: {
      confirmed: "Подтверждено",
      pending: "Ожидает",
      newClient: "Новый клиент",
      break: "Перерыв",
    },
    column: {
      ratingTemplate: "★ {value}",
      unavailable: "Недоступен",
    },
    cell: {
      breakLabel: "Перерыв",
      emptyHint: "Создать запись",
      // BOOKING-STUDIO-RESCHEDULE-PARITY-01: at-a-glance marker on a cell
      // whose client asked to move it — the studio must accept/decline.
      rescheduleBadge: "Клиент просит перенос",
      // STUDIO-MASTER-OWN-BOOKINGS-01: запись с личной страницы мастера —
      // студия видит только, что время занято; управляет ею мастер.
      personalBooking: "Личная запись мастера",
      personalBookingHint: "Мастер принял эту запись сам — ею управляет он",
    },
    // TZ-DISPLAY-SALON-PARITY-01: the datetime-local inputs in the
    // create/move dialogs are edited as SALON-local wall-clock (converted
    // via salon tz), so a cross-tz admin knows they're not editing browser tz.
    salonTimeInputHint: "время студии",
    actions: {
      menuTitle: "Действия с записью",
      // STUDIO-CLEANUP-FIX-A #1г: `details` key removed alongside
      // the «Детали записи» Button it labelled (was a pure no-op).
      moveToMaster: "Перенести на другого мастера",
      moveTime: "Перенести по времени",
      cancel: "Отменить запись",
      // STUDIO-CONFIRM-01: студийные записи рождаются неподтверждёнными, а
      // подтвердить их из кабинета студии было нечем.
      confirm: "Подтвердить запись",
      awaitingConfirmation: "Запись ждёт подтверждения",
      confirmError: "Не удалось подтвердить запись. Попробуйте ещё раз.",
    },
    // BOOKING-STUDIO-RESCHEDULE-PARITY-01: accept/decline a client-proposed
    // reschedule from the calendar cell + journal row action menu (parity with
    // the master side). Reuses `/confirm` + `/decline-reschedule`.
    reschedule: {
      title: "Клиент предложил новое время",
      // FIX-STUDIO-02 (F4): show the CURRENT datetime alongside the proposed
      // one (both with dates) so a cross-day move can't be accepted blindly.
      currentLabel: "Текущее время",
      proposedLabel: "Новое время",
      accept: "Принять новое время",
      decline: "Отклонить перенос",
    },
    createDialog: {
      title: "Новая запись",
      masterLabel: "Мастер",
      masterPlaceholder: "Выберите мастера",
      serviceLabel: "Услуга",
      servicePlaceholder: "Выберите услугу",
      clientLabel: "Имя клиента",
      // FIX-NAME-HINT: пример в порядке «Фамилия Имя» — тот же порядок, о
      // котором просит подсказка `common.clientNameHint` под полем.
      clientPlaceholder: "Соколова Анна",
      phoneLabel: "Телефон клиента",
      phonePlaceholder: "+7 999 123-45-67",
      cancel: "Отмена",
      submit: "Создать запись",
      submitting: "Создаём…",
    },
    moveDialog: {
      titleToMaster: "Перенести на другого мастера",
      titleTime: "Перенести по времени",
      masterLabel: "Мастер",
      // STUDIO-RESCHEDULE-VALIDATION-A: appended in the master
      // picker option label when the master can't perform the
      // booking's service. Option is `disabled`; this suffix
      // explains why.
      masterIncompatibleSuffix: "не выполняет эту услугу",
      masterIncompatibleHint:
        "Этот мастер не выполняет выбранную услугу — выберите другого.",
      cancel: "Отмена",
      confirm: "Перенести",
      submitting: "Переносим…",
    },
    cancelDialog: {
      title: "Отменить запись",
      bodyTemplate: "Запись {client} · {service} будет отменена.",
      reasonLabel: "Причина (необязательно)",
      reasonPlaceholder: "Напишите причину для клиента",
      cancel: "Назад",
      confirm: "Отменить запись",
    },
    weekView: {
      masterColumn: "Мастер",
      // MOBILE-POLISH: загрузка по графику мастера — процент в ячейке,
      // подробности в подсказке.
      occupancyPercent: "{percent}%",
      occupancyTitleMinutes: "Записей: {booked} · занято {bookedTime} из {capacityTime}",
      occupancyTitleSlots: "Записей: {booked} · окон по графику: {slots}",
      // Ячейка дня узкая (7 в ряд) — полное слово налезало на соседнюю. Полное — в `title`.
      dayOff: "Вых.",
      dayOffFull: "Выходной",
      empty: "В этой студии пока нет мастеров.",
      // SCHEDULE-FLEX-DATE-NAV: в ячейке недели — записи мастера, дальше «ещё N».
      bookingsMore: "ещё {n}",
      freeTime: "свободно {time}",
      freeStarts: "свободно начал: {n}",
      // Неделя на телефоне — списком по дням.
      agendaEmpty: "Записей нет",
      agendaNobodyWorks: "По графику никто не работает",
      agendaBookingOne: "запись",
      agendaBookingFew: "записи",
      agendaBookingMany: "записей",
      agendaFreeMaster: "{master} — свободно {time}",
      agendaFreeStartsMaster: "{master} — свободно начал: {n}",
    },
    empty: {
      noMasters: "Сегодня нет мастеров на смене.",
    },
    errors: {
      create: "Не удалось создать запись. Попробуйте ещё раз.",
      // error-hint-ok: своя причина — время, скорее всего, занято
      move: "Не удалось перенести запись. Возможно, это время уже занято.",
      cancel: "Не удалось отменить запись. Попробуйте ещё раз.",
      // BOOKING-STUDIO-RESCHEDULE-PARITY-01: accept/decline of a client-proposed
      // reschedule failed (e.g. the new time now conflicts).
      bookingReschedule:
        "Не удалось ответить на перенос. Попробуйте ещё раз.",
      masterRequired: "Выберите мастера.",
      serviceRequired: "Выберите услугу.",
      clientNameRequired: "Укажите имя клиента.",
      clientPhoneRequired: "Укажите телефон клиента.",
      clientPhoneInvalid: "Проверьте номер телефона.",
      // STUDIO-BOOKINGS-FIX-A #3б: explicit error when the header
      // «Новая запись» button is used but the studio admin didn't
      // pick a time. Pre-fix the form fell back to generic «create»
      // — confusing because there was nothing visible to fix.
      breakMasterRequired: "Выберите мастера для перерыва.",
      breakTimeRange: "Время окончания должно быть позже начала.",
      breakCreate: "Не удалось создать перерыв. Попробуйте ещё раз.",
      breakDelete: "Не удалось удалить перерыв. Попробуйте ещё раз.",
    },
  },
  servicesV2: {
    header: {
      title: "Услуги студии",
      addService: "Добавить услугу",
    },
    categories: {
      title: "Категории",
      addCategory: "Категория",
      empty: "Создайте первую категорию",
      pendingBadge: "На модерации",
      pendingHint: "Категория на модерации — видна только вам, пока мы её не одобрим",
      // STUDIO-SERVICES-SORT-A: «Скрыть пустые» toggle label +
      // actionable hint when every category is hidden by the
      // filter (admin can switch off, or add services).
      hideEmptyLabel: "Скрыть пустые",
      allEmptyHint:
        "Все категории пустые. Отключите фильтр или добавьте услуги.",
    },
    list: {
      searchPlaceholder: "Поиск услуги",
      searchPlaceholderTemplate: "Поиск в категории «{category}»",
      empty: "В этой категории пока нет услуг.",
      bookingsTemplate: "{count} записей за 30 дней",
      pausedBadge: "пауза",
      noMasterBadge: "без мастера",
    },
    detail: {
      caption: "УСЛУГА",
      empty: {
        title: "Выберите услугу",
        hint: "Выберите услугу слева, чтобы изменить цену и время.",
      },
      nameLabel: "Название",
      priceLabel: "Цена, ₽",
      durationLabel: "Длительность",
      categoryLabel: "Категория",
      categoryNone: "— Без категории —",
      pendingSuffix: "на модерации",
      isActiveLabel: "Услуга активна",
      isActiveHint: "Выключенную услугу не видно в каталоге, и записаться на неё нельзя.",
      mastersLabel: "Кто делает эту услугу · {count}",
      mastersEmpty: "Назначьте хотя бы одного мастера, чтобы клиенты могли записаться.",
      assignMaster: "Назначить мастера",
      unassignMaster: "Снять мастера",
      save: "Сохранить",
      saving: "Сохраняем…",
      saved: "Изменения сохранены",
      delete: "Удалить",
    },
    addServiceDialog: {
      title: "Новая услуга",
      nameLabel: "Название",
      namePlaceholder: "Маникюр классический",
      priceLabel: "Цена, ₽",
      durationLabel: "Длительность",
      categoryLabel: "Категория",
      categoryNone: "Выберите категорию",
      pendingSuffix: "на модерации",
      proposeCategory: "Новая категория",
      proposeHint:
        "Категорию проверит модератор. Услугу можно добавить в неё сразу.",
      proposePlaceholder: "Например: Ногти",
      proposeSubmit: "Создать",
      proposeSubmitting: "Создаём…",
      proposeCancel: "Отмена",
      cancel: "Отмена",
      submit: "Создать",
      submitting: "Создаём…",
    },
    addCategoryDialog: {
      title: "Новая категория",
      subtitle: "Категория поможет группировать услуги в прайсе.",
      nameLabel: "Название категории",
      namePlaceholder: "Например: Ногти",
      cancel: "Отмена",
      submit: "Добавить",
      submitting: "Добавляем…",
    },
    assignMasterDialog: {
      title: "Назначить мастера",
      subtitle: "Выберите мастера — он сможет оказывать эту услугу.",
      masterLabel: "Мастер",
      noAvailable:
        "Все мастера уже назначены. Приглашённые появятся здесь, когда примут приглашение.",
      cancel: "Отмена",
      submit: "Назначить",
      submitting: "Назначаем…",
    },
    deleteServiceDialog: {
      title: "Удалить услугу",
      bodyTemplate:
        "Услуга «{name}» будет удалена из прайса. Действие нельзя отменить.",
      cancel: "Отмена",
      confirm: "Удалить",
    },
    errors: {
      titleRequired: "Укажите название услуги.",
      priceInvalid: "Укажите цену — 0 или больше.",
      categoryRequired: "Выберите категорию.",
      masterRequired: "Выберите мастера.",
      categoryTitleRequired: "Укажите название категории.",
      serviceCreate: "Не удалось создать услугу. Попробуйте ещё раз.",
      categoryCreate: "Не удалось создать категорию. Попробуйте ещё раз.",
      saveFailed: "Не удалось сохранить изменения. Попробуйте ещё раз.",
      deleteFailed: "Не удалось удалить услугу. Попробуйте ещё раз.",
      assignFailed: "Не удалось назначить мастера. Попробуйте ещё раз.",
      unassignFailed: "Не удалось снять мастера. Попробуйте ещё раз.",
      packageNameRequired: "Укажите название пакета.",
      packageMinServices: "Выберите минимум 2 услуги.",
      packageSave: "Не удалось сохранить пакет. Попробуйте ещё раз.",
      packageDelete: "Не удалось удалить пакет. Попробуйте ещё раз.",
    },
    packages: {
      sectionTitle: "Пакеты услуг",
      sectionSubtitle:
        "Объединяйте 2+ услуги в выгодный пакет — клиент видит итоговую цену со скидкой.",
      addPackage: "Создать пакет",
      emptyTitle: "Пакетов пока нет",
      emptyBody:
        "Создайте первый пакет — например, «Маникюр + педикюр» — и предложите клиентам выгодную цену.",
      minServicesHint: "Сначала добавьте хотя бы 2 услуги в прайс.",
    },
    package: {
      edit: "Редактировать",
      delete: "Удалить",
      pausedBadge: "пауза",
      componentsLabel: "Состав · {count} услуг",
      componentDisabled: "выключена",
      warningDisabledComponents:
        "В пакете есть выключенные услуги — клиент не сможет на него записаться.",
      finalPriceLabel: "Цена пакета",
      savingsTemplate: "выгода {amount}",
    },
    packageDialog: {
      discountTypeAria: "Тип скидки",
      titleCreate: "Новый пакет",
      titleEdit: "Пакет услуг",
      nameLabel: "Название пакета",
      namePlaceholder: "Например: Маникюр + педикюр",
      servicesLabel: "Услуги в пакете",
      servicesEmpty:
        "Сначала добавьте услуги в прайс — без них пакет не создать.",
      minServicesHint: "Минимум 2 услуги. Клиент записывается на весь пакет сразу.",
      disabledTag: "выключена",
      discountLabel: "Скидка пакета",
      discountPercent: "Процент",
      discountFixed: "Сумма, ₽",
      previewTotal: "Сумма услуг",
      previewDiscount: "Скидка",
      previewFinal: "Итоговая цена",
      previewDurationTemplate: "Общая длительность ~ {duration}",
      isEnabledLabel: "Пакет активен",
      isEnabledHint: "Выключенные пакеты не показываются в каталоге и при записи.",
      cancel: "Отмена",
      submitting: "Сохраняем…",
      submitCreate: "Создать пакет",
      submitSave: "Сохранить",
    },
    deletePackageDialog: {
      title: "Удалить пакет",
      bodyTemplate: "Пакет «{name}» будет удалён. Действие нельзя отменить.",
      cancel: "Отмена",
      confirm: "Удалить",
    },
  },
  bookingsV2: {
    header: {
      caption: "ВСЕ ЗАПИСИ · {count} на экране",
      title: "Журнал записей",
      newBooking: "Новая запись",
    },
    client: {
      newBadge: "новый",
      vipBadge: "VIP",
    },
    source: {
      catalog: "Каталог",
      phone: "Звонок",
      app: "Приложение",
    },
    actions: {
      menu: "Действия",
    },
  },
  settingsV2: {
    header: {
      title: "Настройки",
    },
    nav: {
      sectionsLabel: "Разделы",
      // FIX-STUDIO-SETTINGS-MERGE: вкладка «Общее» удалена — её единственные
      // собственные поля (слоган + часовой пояс) переехали сюда, а карточка
      // адреса дублировала редактируемую в профиле.
      profile: "Профиль",
      portfolio: "Портфолио",
      ownerTeam: "Владелец и команда",
      notifications: "Уведомления и связь",
      policy: "Правила студии",
      danger: "Необратимые действия",
    },
    portfolio: {
      cardTitle: "Портфолио",
      cardDesc:
        "Добавляйте работы студии — они появятся на публичной странице, в ленте и в историях на главной. Подпишите, кто из мастеров и какую услугу делал.",
    },
    ownerTeam: {
      ownerTitle: "Владелец студии",
      ownerDesc: "Только владелец может удалить студию и менять права команды.",
      ownerMissing: "Владелец не определён. Свяжитесь с поддержкой.",
      transferHint:
        "Передать студию другому владельцу пока нельзя — добавим в одном из обновлений.",
      teamTitle: "Команда управления",
      teamDesc:
        "Администраторы видят все записи студии. Мастера управляются в разделе «Мастера».",
      adminsEmpty: "Пока нет других администраторов кроме владельца.",
      inviteHint:
        "Приглашение администраторов появится позже. Пока приглашать администраторов нельзя — добавим позже.",
      roleOwner: "Владелец",
      roleAdmin: "Администратор",
      youChip: "Вы",
    },
    notifications: {
      channelsTitle: "Каналы уведомлений",
      // FIX-EXTERNAL-GATING-01 (G-2): provider-neutral — each channel card
      // below is flag-gated, so the description must not name a specific
      // (possibly killed/disabled) provider.
      // AUTH-GATE-01: dropped the trailing «SMS пока недоступен — мы
      // подключаем шлюз.» Naming an unshipped channel is still a delivery
      // promise, and the sentence contradicted itself on a surface that is
      // supposed to describe channels that exist. The remaining wording is
      // provider-neutral (FIX-EXTERNAL-GATING-01 G-2) and stays correct
      // whichever channels are enabled.
      channelsDesc:
        "Новости студии приходят в приложение и туда, куда вы подключили.",
      channelPush: "Уведомления на телефон",
      pushEnabled: "Включены",
      pushDisabled: "Выключены",
      pushHint:
        "Включаются сами, когда приложение добавлено на экран телефона. Выбор уведомлений для команды появится позже.",
      telegramTitle: "Telegram",
      telegramDesc: "Присылать новости студии вам в Telegram.",
    },
    policy: {
      title: "Правила записи",
      // FIX-STUDIO-POLICY-EDITABLE: раздел стал редактируемым. Прежний текст
      // отправлял «в настройки расписания мастера» — а туда без мастеров не
      // попасть, и правила студии оказывались недостижимы.
      description:
        "Клиент видит их при записи. Действуют для всей студии — отдельные мастера не нужны.",
      minBookingAhead: "Минимум за",
      minBookingAheadHint: "Раньше этого окна окошко клиенту не покажем.",
      maxBookingAhead: "Максимум вперёд",
      maxBookingAheadHint: "Насколько далеко вперёд открыта запись.",
      cancellationDeadline: "Бесплатная отмена за",
      cancellationDeadlineHint: "Позже этого срока отмена считается поздней.",
      lateCancelAction: "При поздней отмене",
      acceptNewClients: "Новые клиенты",
      acceptNewClientsHint: "Выключите, если записываете только своих.",
      remindersEnabled: "Напоминания",
      remindersEnabledHint: "Письмо клиенту за сутки и за два часа до визита.",
      notSet: "Не задано",
      lateActions: {
        none: "Ничего не делать",
        reminder: "Только напоминание",
        fine: "Штраф (скоро)",
      },
      hoursUnit: "часов",
      daysUnit: "дней",
      saving: "Сохраняем…",
      minBookingAheadInvalid: "Укажите минимум записи от 0 до 168 часов.",
      maxBookingAheadInvalid: (maxDays: number) =>
        `Укажите горизонт записи от 1 до ${maxDays} дней.`,
      cancellationDeadlineInvalid:
        "Укажите срок бесплатной отмены от 0 до 168 часов или оставьте поле пустым.",
    },
    danger: {
      // FIX-STUDIO-ARCHIVE-REMOVED: «Архивировать» удалено — действие писало
      // ровно `isPublished = false`, то есть было вторым, необратимо
      // выглядящим именем для тумблера «Опубликован» в разделе «Профиль».
      deleteTitle: "Удалить студию навсегда",
      deleteDesc:
        "Мастера покинут студию, а записи и подписки будут удалены. Вернуть их нельзя.",
      deleteButton: "Удалить студию",
      deleting: "Удаляем…",
      deleteDialogTitle: "Подтвердите удаление",
      deleteDialogBody:
        "Удаление окончательное. Чтобы продолжить, введите название студии ниже.",
      deleteConfirmLabel: "Введите «{name}» для подтверждения",
      deleteCancel: "Отмена",
      deleteConfirm: "Удалить навсегда",
      activeBookingsError:
        "Сначала отмените или завершите записи, которые ещё впереди.",
    },
    save: "Сохранить",
    cancel: "Отмена",
    toasts: {
      error: "Не удалось сохранить настройки. Попробуйте ещё раз.",
    },
  },
  analyticsV2: {
    viewsAria: "Раздел аналитики",
    header: {
      title: "Бизнес-показатели",
    },
    periodLabel: "Период",
    periods: { d7: "7 дней", d30: "30 дней", d90: "Квартал", d365: "Год" },
    views: {
      overview: "Обзор",
      masters: "Мастера",
      services: "Услуги",
      clients: "Клиенты",
    },
    compare: "Сравнить с прошлым периодом",
    kpi: {
      revenue: "Выручка студии",
      bookings: "Записей",
      avgCheck: "Средний чек",
      occupancy: "Загрузка",
      retention: "Возврат клиентов",
      noPrev: "Нет данных за прошлый период",
    },
    overview: {
      revenueChartTitle: "Выручка по дням",
      revenueCompare: "Сравнение с предыдущим периодом",
      revenueNoCompare: "Период",
      legendNow: "Сейчас",
      legendPrev: "Прошлый период",
      revenueChartAria: "Динамика выручки",
      sourcesTitle: "Источники записи",
      sourcesDesc: "Откуда приходят клиенты",
      hoursTitle: "Загрузка по часам",
      hoursDesc: "Когда у студии пик",
      wasTemplate: "было {value}",
      noData: "Недостаточно данных",
    },
    masters: {
      colMaster: "Мастер",
      colBookings: "Записей",
      colRevenue: "Выручка",
      colAvgCheck: "Ср. чек",
      colOccupancy: "Загрузка",
      colRating: "Рейтинг",
      empty: {
        title: "Нет данных по мастерам",
        hint: "Появится после первых завершённых записей за период.",
      },
    },
    services: {
      colService: "Услуга",
      colBookings: "Записей",
      colRevenue: "Выручка",
      colShare: "Доля",
      colMasters: "Мастеров",
      empty: {
        title: "Нет данных по услугам",
        hint: "Появится после первых завершённых записей за период.",
      },
    },
    clients: {
      segmentsTitle: "Сегменты клиентов",
      segmentsDesc: "Новые / возвращающиеся / постоянные / спящие / потерянные",
      topClientsTitle: "Топ-10 клиентов по выручке",
      topClientsDesc: "Кто приносит больше всего за период",
      colClient: "Клиент",
      colVisits: "Визитов",
      colLifetime: "Выручка",
      empty: {
        title: "Нет клиентов за период",
        hint: "Как только записей станет больше, здесь появятся группы клиентов.",
      },
    },
  },
  notificationsV2: {
    header: {
      title: "Уведомления",
    },
    filters: {
      aria: "Какие уведомления показать",
      all: "Все",
      unread: "Непрочитанные",
      bookings: "Записи",
      cancellations: "Отмены",
      reschedules: "Переносы",
      reviews: "Отзывы",
      messages: "Сообщения",
      team: "Команда",
      finance: "Финансы",
      system: "От платформы",
      sortNewest: "Сначала новые",
      sortOldest: "Сначала старые",
      markAllRead: "Прочитать всё",
      markAllReadFailed: "Не удалось отметить уведомления. Попробуйте ещё раз.",
    },
    card: {
      relatesTo: "Касается",
      unreadAria: "Непрочитанное уведомление",
    },
    actions: {
      approve: "Подтвердить",
      reject: "Отклонить",
      rejectPrompt: "Укажите причину отклонения заявки:",
      rejectTitle: "Отклонить заявку",
      rejectLabel: "Причина",
      openRequest: "Открыть заявку",
      openBooking: "К записи",
      openReview: "К отзыву",
      openChat: "К чату",
      openClient: "К клиенту",
      open: "Открыть",
      acceptReschedule: "Принять перенос",
      declineReschedule: "Отклонить перенос",
    },
    empty: {
      title: "Нет уведомлений",
      hint: "Уведомления появятся здесь, как только что-то произойдёт.",
    },
    errors: {
      scheduleRequest: "Не удалось ответить на заявку. Попробуйте ещё раз.",
      bookingReschedule: "Не удалось ответить на перенос. Попробуйте ещё раз.",
    },
  },
  reviewsV2: {
    header: {
      title: "Отзывы клиентов",
    },
    filters: {
      aria: "Какие отзывы показать",
      all: "Все",
      noReply: "Без ответа",
      lowRating: "Низкие оценки",
      fiveStar: "5 звёзд",
      masterAll: "Все мастера",
    },
    card: {
      replyCaption: "ОТВЕТ СТУДИИ",
      reportedBadge: "На рассмотрении",
    },
    actions: {
      reply: "Ответить",
      report: "Пожаловаться",
    },
    replyForm: {
      placeholder: "Ваш ответ клиенту…",
      hint: "Ответ будет опубликован от имени студии.",
      submit: "Опубликовать ответ",
      submitting: "Публикуем…",
      cancel: "Отмена",
    },
    reportDialog: {
      title: "Пожаловаться на отзыв",
      subtitle: "Жалоба отправится администратору платформы. Можно подать только один раз.",
      reasonLabel: "Причина",
      commentLabel: "Комментарий (необязательно)",
      commentPlaceholder: "Опишите, почему отзыв нарушает правила",
      submit: "Отправить",
      cancel: "Отмена",
    },
    pagination: {
      loadMore: "Показать ещё",
    },
    empty: {
      title: "Нет отзывов",
      hint: "Отзывы клиентов будут появляться здесь после завершённых записей.",
    },
    toasts: {
      error: "Не удалось отправить ответ. Попробуйте ещё раз.",
    },
  },
  clientsV2: {
    header: {
      title: "Клиенты студии",
      addClient: "Клиент",
    },
    segments: {
      title: "Сегменты",
      all: "Все клиенты",
      vip: "VIP",
      regular: "Постоянные",
      new: "Новые",
      sleeping: "Спящие",
    },
    filters: {
      searchPlaceholder: "Имя клиента или телефон",
      masterAll: "Все мастера",
    },
    table: {
      colClient: "Клиент",
      colPhone: "Телефон",
      colVisits: "Визитов",
      colLtv: "Всего оставил",
      colLast: "Последний визит",
      colMainMaster: "Основной мастер",
      mastersCountTemplate: "у {count} мастеров",
      avgCheckTemplate: "ср. {amount}",
    },
    badges: {
      vip: "VIP",
      regular: "Постоянный",
      new: "Новый",
      sleeping: "Спящий",
      other: "—",
    },
    actions: {
      book: "Записать",
    },
    pagination: {
      loadMore: "Показать ещё",
    },
    empty: {
      title: "Нет клиентов",
      hint: "Клиенты появятся после первых записей.",
      filteredTitle: "Под фильтр никто не попал",
      filteredHint: "Измените запрос или сбросьте фильтры.",
      resetCta: "Сбросить фильтры",
    },
  },
  mastersV2: {
    header: {
      title: "Мастера студии",
      inviteButton: "Пригласить мастера",
    },
    filters: {
      tabsAria: "Какие мастера показать",
      searchPlaceholder: "Поиск по имени или специализации",
      tabs: {
        all: "Все",
        active: "Активные",
        invited: "Новые",
        disabled: "Пауза",
      },
    },
    status: {
      active: "Работает",
      invited: "Новый",
      disabled: "Пауза",
    },
    listItem: {
      youChip: "вы",
      bookingsTemplate: "{count} записей",
      occupancyTemplate: "{percent}% загрузка",
    },
    list: {
      shownTemplate: "Показано: {count} из {total}",
      empty: "Никого не нашли — попробуйте сменить фильтр.",
      emptyTeam: "В команде пока никого — пригласите первого мастера.",
    },
    inviteCard: {
      title: "Пригласить ещё мастера",
      // AUTH-GATE-01: was «По телефону — мастер получит SMS со ссылкой».
      // No SMS is sent — `notifyStudioInviteReceived` delivers an in-app
      // notification and ONLY when the phone already belongs to a registered
      // user (it early-returns otherwise). Copy now states the part that is
      // always true: the master appears in the team as «Приглашён».
      subtitle: "Добавьте мастера по номеру телефона",
    },
    detail: {
      empty: {
        title: "Выберите мастера",
        hint: "Выберите мастера слева, чтобы посмотреть подробности.",
      },
      youChip: "Это вы",
      joinedTemplate: "в студии с {date}",
      clientsTemplate: "{count} клиентов",
      actions: {
        // STUDIO-CLEANUP-FIX-A #4а: `message` key removed — the
        // «Написать» button it labelled was a misleading Link to
        // the client-cabinet messages page (studio admin isn't a
        // chat participant per invariant #26). Feature deferred to
        // backlog. Other actions preserved.
        schedule: "Расписание",
        publicProfile: "Публичный профиль",
        pause: "Поставить на паузу",
        activate: "Вернуть к работе",
        // FIX-STUDIO-02 (F7): revoke a still-pending invite (INVITED status).
        revoke: "Отозвать приглашение",
        // STUDIO-EDIT-MASTER-PROFILE-01
        editProfile: "Редактировать профиль",
        // 29.09 доработки · 04
        remove: "Удалить из студии",
      },
      // 29.09 доработки · 04: будущие записи студии у мастера — удалить из
      // студии можно только после их переноса или отмены.
      blockingBookings: (count: number) =>
        `Будущих записей в студии: ${count} — перед удалением перенесите их на другого мастера или отмените.`,
      weekSchedule: {
        title: "Расписание · эта неделя",
        subtitle: "Мастер меняет своё расписание через заявку вам",
        seeCalendar: "В календарь →",
        slotsTemplate: "{booked}/{total}",
        // Ячейка дня узкая (7 в ряд) — полное слово налезало на соседнюю. Полное — в `title`.
        dayOff: "Вых.",
        dayOffFull: "Выходной",
      },
    },
    inviteDialog: {
      title: "Пригласить мастера",
      // AUTH-GATE-01: see inviteCard.subtitle — no SMS is sent for invites.
      // STUDIO-INVITE-EMAIL-01: по почте уходит письмо со ссылкой, и принять
      // такое приглашение можно сразу — почта подтверждается входом.
      subtitle:
        "Введите телефон или почту — мастер появится в команде с пометкой «Приглашён». На почту придёт письмо с приглашением.",
      phoneLabel: "Телефон или почта",
      phonePlaceholder: "+7 999 123-45-67 или anna@mail.ru",
      nameLabel: "Имя",
      namePlaceholder: "Анна Соколова",
      taglineLabel: "Специализация",
      taglinePlaceholder: "Маникюр, педикюр",
      cancel: "Отмена",
      submit: "Отправить приглашение",
    },
    // STUDIO-EDIT-MASTER-PROFILE-01 — руководитель студии правит профиль мастера.
    editProfileDialog: {
      title: "Профиль мастера",
      subtitle: "Так мастера увидят клиенты — на странице студии, на его странице и в каталоге.",
      photoLabel: "Фото",
      nameLabel: "Имя",
      taglineLabel: "Специализация",
      taglinePlaceholder: "Маникюр, педикюр",
      descriptionLabel: "О мастере",
      descriptionPlaceholder: "Опыт, техники, чем мастер хорош",
      nameRequired: "Укажите имя мастера.",
      taglineRequired: "Укажите специализацию мастера.",
      saveFailed: "Не удалось сохранить профиль мастера. Попробуйте ещё раз.",
      submit: "Сохранить",
      cancel: "Отмена",
    },
    pauseDialog: {
      title: "Поставить на паузу",
      bodyTemplate: "Мастер {name} не будет принимать новые записи. Действие можно отменить в любой момент.",
      cancel: "Отмена",
      confirm: "Поставить на паузу",
      submitting: "Сохраняем…",
    },
    activateDialog: {
      title: "Вернуть мастера к работе",
      bodyTemplate: "Мастер {name} снова сможет принимать новые записи.",
      cancel: "Отмена",
      confirm: "Вернуть к работе",
      submitting: "Сохраняем…",
    },
    // 29.09 доработки · 04: исключение мастера из студии.
    removeDialog: {
      title: "Удалить из студии",
      bodyTemplate:
        "Мастер {name} больше не будет работать в студии: студийные записи, расписание и услуги ему станут недоступны. Его личная страница и личные записи останутся.",
      transferServicesLabel: "Сохранить мастеру его услуги",
      transferServicesHint: "Услуги студии, которые он оказывал, появятся в его личном прайсе.",
      cancel: "Отмена",
      confirm: "Удалить из студии",
      openCalendar: "Открыть расписание мастера",
    },
    // FIX-STUDIO-02 (F7): confirm dialog for revoking a pending invite.
    revokeDialog: {
      title: "Отозвать приглашение",
      bodyTemplate:
        "Приглашение мастеру {name} будет отменено, а ссылка перестанет работать. Место в команде не изменится.",
      cancel: "Отмена",
      confirm: "Отозвать приглашение",
    },
    errors: {
      phoneInvalid: "Укажите телефон или почту мастера.",
      nameRequired: "Укажите имя мастера.",
      taglineRequired: "Укажите специализацию.",
      inviteFailed: "Не удалось отправить приглашение. Попробуйте ещё раз.",
      actionFailed: "Не удалось изменить мастера. Попробуйте ещё раз.",
      removeFailed: "Не удалось удалить мастера из студии. Попробуйте ещё раз.",
      // FIX-STUDIO-02 (F6): localized team-cap block. The enforcement
      // (`ensureStudioTeamLimit`) is unchanged — only the message. Says what
      // the limit is and how to raise it, instead of the raw «Limit reached».
      teamCapReached:
        "На вашем тарифе можно держать до {max} активных мастеров. Чтобы добавить больше, перейдите на тариф выше.",
      teamCapReachedGeneric:
        "На вашем тарифе больше активных мастеров не добавить. Чтобы добавить, перейдите на тариф выше.",
      // FIX-STUDIO-02 (F7): revoke-invite failure.
      revokeFailed: "Не удалось отозвать приглашение. Попробуйте ещё раз.",
    },
  },
  scheduleRequests: {
    title: "Заявки на расписание",
    pendingTitle: "Ожидают решения",
    pendingCount: "Всего: {count}",
    resolvedTitle: "Недавние решения",
    emptyPendingTitle: "Заявок нет",
    emptyPendingBody: "Когда мастер запросит изменение расписания, заявка появится здесь.",
    submittedAt: "Отправлено",
    commentLabel: "Комментарий",
    status: {
      pending: "Ожидает",
      approved: "Подтверждена",
      rejected: "Отклонена",
    },
    actions: {
      approve: "Подтвердить",
      reject: "Отклонить",
    },
    preview: {
      weekTitle: "Недельный график",
      exceptionsTitle: "Особые дни",
      breaksLabel: "Перерывы",
      legacyTitle: "Изменения расписания",
      patternTitle: "Новый график",
      currentLabel: "Сейчас",
      daysTitle: "Дни календаря",
      dayCount: (count: number) => `Изменения дней: ${count}`,
      dayOff: "Выходной",
      byPattern: "как по графику",
      fixedTime: "фикс. время",
      arrowAria: "станет",
    },
    approveDialog: {
      title: "Подтвердить изменения?",
      body: "Расписание мастера {provider} будет обновлено сразу после подтверждения. Действие необратимо.",
      cancel: "Отмена",
      confirm: "Подтвердить",
    },
    rejectDialog: {
      title: "Отклонить заявку?",
      body: "Мастер {provider} получит уведомление с вашим комментарием.",
      commentLabel: "Причина отказа",
      commentPlaceholder: "Кратко опишите, почему заявку нельзя подтвердить",
      cancel: "Отмена",
      confirm: "Отклонить",
    },
    errors: {
      approveFailed: "Не удалось подтвердить заявку. Попробуйте ещё раз.",
      rejectFailed: "Не удалось отклонить заявку. Попробуйте ещё раз.",
      commentRequired: "Укажите причину отказа.",
    },
  },
} as const;
