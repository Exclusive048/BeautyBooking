import { pluralize } from "@/lib/utils/pluralize";

export const cabinetMaster = {
  // STUDIO-MASTER-PROFILES (этап 3, решение владельца 2026-09-27): пометка
  // контекста записи — личная или студии. Видит её только мастер, который
  // работает и лично, и в студии (соло-мастеру пометка — шум).
  workContext: {
    personal: "Личная запись",
    studioTemplate: "Студия «{name}»",
    studioShort: "Студия",
    legendPersonal: "Личные записи",
    legendStudio: "Записи студии",
    revenueSplitTemplate: "личные {personal} · студия {studio}",
    schedulePersonal: "Личное расписание",
    scheduleStudioTemplate: "В студии «{name}»",
  },
  brand: {
    title: "МастерРядом",
    subtitle: "Кабинет мастера",
  },
  nav: {
    groups: {
      work: "Работа",
      clients: "Клиенты",
      business: "Бизнес",
      account: "Аккаунт",
    },
    items: {
      home: "Главная",
      bookings: "Записи",
      notifications: "Уведомления",
      messages: "Сообщения",
      schedule: "Расписание",
      scheduleSettings: "Настройки расписания",
      clients: "Клиенты",
      reviews: "Отзывы",
      analytics: "Аналитика",
      profile: "Мой профиль",
      accountSettings: "Настройки аккаунта",
      publicPage: "Публичная страница",
    },
    ariaLabel: "Навигация кабинета мастера",
  },
  topbar: {
    breadcrumbHome: "Кабинет",
    newBookingCta: "Новая запись",
  },
  pageHeader: {
    breadcrumbHome: "Кабинет",
    notificationsAria: "Уведомления",
    newBookingCta: "Новая запись",
  },
  scheduleSettings: {
    breadcrumb: "Настройки расписания",
    title: "Настройки расписания",
    subtitle: "График, календарь, перерывы и правила записи",
    previewCta: "Посмотреть глазами клиента",
    studioApproval: {
      infoTemplate:
        "Вы в команде студии «{studio}». Изменения расписания отправляются на одобрение студии — текущее расписание не меняется, пока студия не подтвердит.",
      sentTemplate:
        "Изменения отправлены на одобрение студии «{studio}». Текущее расписание не изменится, пока студия не подтвердит.",
      pendingBadge: "Ожидает одобрения",
    },
    saveStatus: {
      idle: "",
      saving: "Сохраняем",
      saved: "Сохранено",
      error: "Не удалось сохранить. Попробуйте ещё раз.",
      retry: "Повторить",
    },
    tabs: {
      calendar: "Календарь",
      breaks: "Перерывы",
      rules: "Правила",
      visibility: "Видимость",
      soonHint: "Скоро",
    },
    slotStep: {
      // COPY-BEAUTY-01 — «шаг слота / квант» заменены на язык мастера:
      // окошко — то, что клиент видит и выбирает; шаг — как часто окошки
      // начинаются. Пример в подсказке важнее определения.
      sectionTitle: "Шаг окошек",
      hint: "Как часто начинаются свободные окошки. Например, при шаге 30 минут клиент видит 10:00, 10:30, 11:00.",
      options: {
        "15": "15 мин",
        "30": "30 мин",
        "60": "1 час",
      },
    },
    // Вкладки «Часы» нет (SCHEDULE-HOURS-TAB-REMOVAL, 2026-10-01): от недели
    // остались подписи дней — их читает сводка графика (`describe-plan.ts`).
    week: {
      days: {
        mon: "Пн",
        tue: "Вт",
        wed: "Ср",
        thu: "Чт",
        fri: "Пт",
        sat: "Сб",
        sun: "Вс",
      },
    },
    // SCHEDULE-PATTERNS-01 (этап 2): «график» — это чередование (решение
    // владельца 2026-09-28); слово «смена» не используется.
    plan: {
      title: "График работы",
      noneTitle: "График не настроен",
      noneHint: "Настройте график — клиенты увидят свободные окошки.",
      endedHint: "Расписание закончилось — клиенты не видят окошек. Настройте график заново.",
      notStartedHint: (date: string) => `Расписание начнётся ${date}.`,
      weekdaysSummary: (days: string) => `По дням недели: ${days}`,
      cycleSummary: (work: number, off: number) => `${work} через ${off}`,
      customCycleSummary: (days: number) =>
        `Свой график на ${days} ${pluralize(days, "день", "дня", "дней")}`,
      weeksSummary: (weeks: number) =>
        `Чередование: ${weeks} ${pluralize(weeks, "неделя", "недели", "недель")}`,
      weeksDaysSummary: (weeks: string) => `Недели чередуются: ${weeks}`,
      allDaysOff: "Все дни выходные",
      manualSummary: "Дни отмечаю сам",
      hoursSummary: (start: string, end: string) => `${start}–${end}`,
      fixedSummary: "фиксированное время",
      mixedHoursSummary: "часы по дням",
      untilLabel: (date: string) => `Настроено до ${date}`,
      autoExtendLabel: "Продлевать автоматически",
      autoExtendHint: "Без даты окончания — расписание продолжится само.",
      endDateLabel: "До какого дня",
      upcomingLabel: (date: string, summary: string) => `С ${date}: ${summary}`,
      setupCta: "Настроить график",
      studioProfileHint: "График работы в студии меняется заявкой: студия рассмотрит её и применит.",
      proposeCta: "Предложить график",
      requestSent: "Заявка отправлена — студия рассмотрит её.",
      saveError: "Не удалось сохранить. Попробуйте ещё раз.",
      endingNotificationLabel: "Расписание кончается",
      endingNotificationTitle: "Расписание скоро закончится",
      endingNotificationBody: (date: string) =>
        `Расписание настроено до ${date}. После этого клиенты не увидят свободных окошек. Продлите график или включите автопродление.`,
      studioEndingNotificationTitle: "Расписание мастера скоро закончится",
      studioEndingNotificationBody: (master: string, date: string) =>
        `У мастера ${master} расписание в студии настроено до ${date}. После этого клиенты не увидят его свободных окошек. Продлите график в «Графике команды».`,
      endingSoonHint: (date: string) =>
        `Расписание закончится ${date} — после этого клиенты не увидят окошек.`,
      manualHint: "Рабочие дни отмечаются в календаре ниже.",
      endingCta: "Продлить график",
    },
    // SCHEDULE-PATTERNS-01 (этап 3): календарь на 3 месяца и палитра рабочих
    // дней. Кисть — рабочий день палитры; «как по графику» снимает правку.
    calendar: {
      title: "Календарь",
      hint: "Нажмите на день, чтобы изменить его, или выберите кисть и отмечайте дни подряд.",
      brushHint: (name: string) => `Нажимайте на дни — они станут «${name}». Нажмите на кисть ещё раз, чтобы снять её.`,
      brushesLabel: "Кисти",
      offBrush: "Выходной",
      resetBrush: "Как по графику",
      paletteCta: "Палитра",
      addDayCta: "Рабочий день",
      prevMonthAria: "Предыдущий месяц",
      nextMonthAria: "Следующий месяц",
      loadError: "Не удалось загрузить календарь. Попробуйте ещё раз.",
      retry: "Повторить",
      saveError: "Не удалось сохранить день. Попробуйте ещё раз.",
      todayAria: "сегодня",
      paintedAria: "изменён в календаре",
      bookingsAria: (count: number) =>
        `${count} ${pluralize(count, "запись", "записи", "записей")}`,
      dayOffAria: "выходной",
      legendPainted: "изменён в календаре",
      legendBookings: "записи",
      legendOff: "выходной",
      legendStudio: (name: string) => `работа в студии «${name}»`,
      studioDayAria: (hours: string) => `работа в студии ${hours}`,
      keptBookingsNotice:
        "На этих днях есть записи — они остались. Если нужно, перенесите или отмените их в расписании.",
      requestHint:
        "Правки дней уходят студии заявкой: день изменится, когда студия её одобрит. Нажмите на день или выберите кисть.",
      requestSummary: (days: number, withPattern: boolean, withWeek: boolean) => {
        const parts: string[] = [];
        if (days > 0) parts.push(`${days} ${pluralize(days, "день", "дня", "дней")}`);
        if (withPattern) parts.push("новый график");
        if (withWeek) parts.push("новые часы недели");
        return `В заявке студии: ${parts.join(", ")}. Студия рассмотрит её и применит.`;
      },
      requestedAria: "в заявке студии",
      legendRequested: "в заявке студии",
      dismiss: "Понятно",
      customHours: (start: string, end: string) => `${start}–${end}`,
      fixedLabel: "фикс. время",
      sheet: {
        byScheduleLabel: "По графику",
        paintedLabel: "Изменён в календаре",
        offLabel: "Выходной",
        bookingsLabel: (count: number) =>
          `${count} ${pluralize(count, "запись", "записи", "записей")} в этот день`,
        chooseLabel: "Что в этот день",
        ownHoursCta: "Свои часы на этот день",
        applyHoursCta: "Поставить часы",
        resetCta: "Вернуть как по графику",
        pastHint: "Прошедший день изменить нельзя.",
        requestedLabel: "В заявке студии",
        withdrawCta: "Убрать из заявки",
        studioLine: (name: string, hours: string) =>
          `В студии «${name}»: ${hours}. Это время занято и для личных записей; расписание в студии меняет студия.`,
      },
      palette: {
        title: "Палитра рабочих дней",
        hint: "Рабочие дни, которыми вы отмечаете календарь. Часы у дня не меняются — для других часов создайте новый рабочий день.",
        empty: "Пока нет рабочих дней с названием.",
        createTitle: "Новый рабочий день",
        editTitle: "Рабочий день",
        labelField: "Название",
        labelPlaceholder: "Например, Утро",
        colorField: "Цвет",
        colorAria: (n: number) => `Цвет ${n}`,
        hoursReadonly: "Часы этого дня не меняются: на него уже опираются прошедшие дни.",
        create: "Создать",
        save: "Сохранить",
        delete: "Удалить",
        inUseHint: "Этот день стоит в графике или в календаре — удалить его пока нельзя.",
        saveError: "Не удалось сохранить рабочий день. Попробуйте ещё раз.",
        deleteError: "Не удалось удалить рабочий день. Попробуйте ещё раз.",
        untitled: "Без названия",
      },
    },
    wizard: {
      title: "Настроить график",
      stepLabel: (step: number, total: number) => `Шаг ${step} из ${total}`,
      back: "Назад",
      next: "Далее",
      apply: "Применить график",
      sendRequest: "Отправить заявку",
      applying: "Применяем…",
      applyError: "Не удалось применить график. Попробуйте ещё раз.",
      kind: {
        title: "Как вы работаете?",
        weekTitle: "Одни и те же дни недели",
        weekHint: "Например, с понедельника по пятницу.",
        cycleTitle: "Через день, 2 через 2, 3 через 3",
        cycleHint: "Рабочие и выходные дни идут по кругу, неделя не важна.",
        weeksTitle: "Недели чередуются",
        weeksHint: "Например, по-разному в чётные и нечётные недели.",
        manualTitle: "Каждый раз по-разному",
        manualHint: "Отмечу рабочие дни сам в календаре.",
        quickTitle: "Быстрый выбор",
        quickHint: "Нажмите — и сразу к часам работы.",
        quickWeekdays: "5/2 · Пн–Пт",
        quickSixDays: "6/1 · Пн–Сб",
        quickEveryDay: "Каждый день",
        customTitle: "Или настройте по-своему",
      },
      days: {
        title: "Рабочие дни",
        weekdaysPreset: "Пн–Пт",
        sixDaysPreset: "Пн–Сб",
        everyDayPreset: "Каждый день",
        cyclePreset: (work: number, off: number) => `${work} через ${off}`,
        customPreset: "Свой",
        workDaysLabel: "Рабочих дней подряд",
        offDaysLabel: "Выходных подряд",
        firstDayLabel: "Первый рабочий день",
        weeksCountLabel: "Сколько недель чередуются",
        weekLabel: (n: number) => `Неделя ${n}`,
        currentWeekLabel: "Какая неделя сейчас?",
        previewTitle: "Ближайшие две недели",
        previewWork: "Рабочий день",
        previewOff: "Выходной",
        noWorkDays: "Отметьте хотя бы один рабочий день.",
      },
      hours: {
        title: "Часы работы",
        startLabel: "Начало",
        endLabel: "Конец",
        addBreak: "Добавить перерыв",
        breakLabel: "Перерыв",
        removeBreakAria: "Убрать перерыв",
        modeFlexible: "Часы работы и перерывы",
        modeFlexibleHint: "Свободные окошки складываются сами — по длительности услуги.",
        modeFixed: "Фиксированное время",
        modeFixedHint: "Клиенты записываются только на выбранное вами время.",
        fixedTimesLabel: "Время приёма",
        addFixedTime: "Добавить время",
        removeFixedTimeAria: "Убрать время",
        breakStartAria: "Начало перерыва",
        breakEndAria: "Конец перерыва",
        fixedTimeAria: (n: number) => `Время приёма ${n}`,
        invalidRange: "Конец рабочего дня должен быть позже начала.",
        noFixedTimes: "Добавьте хотя бы одно время приёма.",
        sameForAll: "Одинаковые во все дни",
        perDay: "Разные по дням",
        perDayHint: "Задайте часы для каждого рабочего дня. «Фиксированное время» доступно, только если часы во все дни одинаковые.",
        dayLabel: (n: number) => `День ${n}`,
        weekDayLabel: (week: number, day: string) => `Неделя ${week} · ${day}`,
        manualTitle: "Обычный рабочий день",
        manualHint: "Он появится в палитре календаря — им вы отметите рабочие дни. Другие рабочие дни можно добавить потом.",
        manualDayLabel: "Рабочий день",
      },
      period: {
        title: "Когда",
        startLabel: "С какого дня",
        autoExtendLabel: "Продлевать автоматически",
        autoExtendHint: "Без даты окончания — расписание продолжится само.",
        endLabel: "До какого дня",
        endHint: "Расписание можно настроить не дальше чем на 3 месяца вперёд.",
        resumePreviousLabel: "После — вернуть прежний график",
        resumePreviousHint: "Например, если это график на лето.",
      },
      review: {
        title: "Проверьте",
        fromLabel: (date: string) => `С ${date}`,
        untilLabel: (date: string) => `по ${date}`,
        autoExtendNote: "продлевается автоматически",
        resumeNote: "потом — прежний график",
        calendarTitle: "Ближайшие 4 недели",
        fixedShort: "фикс.",
        checking: "Проверяем записи…",
        checkError: "Не удалось проверить записи. Попробуйте ещё раз.",
        noConflicts: "Записей на новых выходных нет.",
        conflictsTitle: (count: number) =>
          `${count} ${pluralize(count, "запись попадает", "записи попадают", "записей попадают")} на выходные или вне часов`,
        conflictsHint: "Записи останутся. Если нужно — перенесите или отмените их сами.",
        reasonDayOff: "выходной",
        reasonOutsideHours: "вне часов",
        clientFallback: "Клиент",
        manualNote:
          "Пока вы не отметите рабочие дни в календаре, записи на новые дни не будет. Уже созданные записи останутся.",
      },
    },
    placeholders: {
      exceptions: {
        title: "Особые дни и отпуск",
        body: "Здесь появятся одноразовые изменения расписания: отгулы, особые часы на конкретные даты, отпуск.",
      },
      breaks: {
        title: "Регулярные перерывы",
        body: "Тут можно будет настроить повторяющиеся перерывы — обед, мастер-классы, регулярные паузы между записями.",
      },
      rules: {
        title: "Правила записи",
        body: "Пауза между записями, за сколько можно отменить, автоподтверждение и напоминания.",
      },
      visibility: {
        title: "Видимость и публикация",
        body: "Ваша страница, показ в каталоге и на сколько вперёд открыта запись.",
      },
      comingSoon: "Скоро",
    },
    rules: {
      bookingWindow: {
        title: "Когда можно записаться",
        minTitle: "Минимум за",
        minSubtitle: "Окошки, до которых осталось меньше, клиент уже не увидит",
        maxTitle: "Максимум вперёд",
        maxSubtitle: "Дальше этой даты записаться нельзя — даже по прямой ссылке",
        minOptions: {
          "1": "1 час",
          "2": "2 часа",
          "4": "4 часа",
          "24": "сутки",
        },
        maxOptions: {
          "14": "14",
          "30": "30",
          "60": "60",
          "90": "90 дней",
        },
      },
      confirmation: {
        title: "Подтверждение записи",
        autoLabel: "Автоматически",
        autoDescription:
          "Клиент видит «Подтверждено» сразу. Проще для клиента, меньше работы вам.",
        manualLabel: "Вручную",
        manualDescription:
          "Запись ждёт вашего ответа — клиент видит «Ожидает». Вы сами решаете, кого принять.",
      },
      cancellation: {
        title: "Отмена и перенос",
        freeTitle: "Бесплатная отмена",
        freeSubtitle: "За сколько до записи можно отменить без последствий",
        afterTitle: "Если отменили позже",
        afterSubtitle: "Что делать, когда клиент отменяет уже после этого срока",
        freeOptions: {
          "1": "1 час",
          "2": "2 часа",
          "4": "4 часа",
          "12": "12 часов",
        },
        afterOptions: {
          none: "ничего",
          reminder: "напоминание",
          fine: "отметить в карточке",
        },
      },
      hotSlots: {
        badge: "Горящие окошки",
        title: "Снижайте цену для близких окошек",
        body:
          "Если до окошка осталось мало времени — автоматически предложите скидку. Клиенты подтянутся, окошко не пропадёт.",
        locked: "Доступно в PRO и выше",
        lockedCta: "Обновить тариф",
        triggerTitle: "Скидка включается",
        triggerSubtitle: "За сколько до начала окошко считается «горящим»",
        discountTitle: "Размер скидки",
        discountSubtitle: "Сколько клиент сэкономит",
        triggerOptions: {
          "1": "1 час",
          "2": "2 часа",
          "3": "3 часа",
          "6": "6 часов",
        },
        discountOptions: {
          "10": "−10%",
          "15": "−15%",
          "20": "−20%",
          "30": "−30%",
        },
        gateError: "Горящие окошки доступны на PRO и выше. Обновите тариф, чтобы включить.",
      },
    },
    visibility: {
      slot: {
        title: "Как клиенты видят окошки",
        publishedTitle: "Показывать в каталоге",
        // VISIBILITY-DEFAULT-01: включено с рождения кабинета; в каталог
        // профиль попадает, когда есть адрес и рабочие дни.
        publishedSubtitle: "Вас находят в поиске и подборках, когда указан адрес и есть рабочие дни",
        publishedOptions: {
          yes: "Да",
          // Было «Только по ссылке» — неправда: выключенная видимость
          // закрывает и страницу по ссылке, и запись по ней.
          link: "Нет",
        },
        precisionTitle: "Точность времени",
        precisionSubtitle: "Что показывать в карточке мастера",
        precisionOptions: {
          exact: "точное время",
          today_free: "«сегодня свободно»",
          date_only: "только дата",
        },
        daysTitle: "Сколько окошек вперёд",
        daysSubtitle: "Сколько дней показывать в каталоге и карточке мастера. Может быть меньше «Максимум вперёд»",
        daysOptions: {
          "3": "3",
          "7": "7",
          "14": "14",
          "30": "30 дней",
        },
      },
      newClients: {
        title: "Принимать новых клиентов",
        body: "Когда выключено — записаться смогут только те, кто уже у вас был.",
        toggleLabel: "Открыто для новых клиентов",
      },
    },
    breaks: {
      buffer: {
        title: "Пауза между записями",
        subtitle:
          "Запас времени на уборку и подготовку — клиент не сможет записаться вплотную к предыдущей записи.",
        options: {
          "0": "нет",
          "5": "5 мин",
          "10": "10 мин",
          "15": "15 мин",
          "20": "20 мин",
          "30": "30 мин",
        },
      },
      recurring: {
        title: "Повторяющиеся перерывы",
        subtitle:
          "Фиксированные паузы внутри рабочего дня — обед, перекуры, медитация.",
        addCta: "Добавить",
        emptyBody: "Пока нет повторяющихся перерывов.",
        deleteAria: "Удалить",
        deleteConfirm: "Удалить перерыв?",
        fallbackTitle: "Перерыв",
      },
      modal: {
        title: "Новый перерыв",
        nameLabel: "Название (необязательно)",
        namePlaceholder: "Обед, Кофе-пауза…",
        daysLabel: "Дни недели",
        quickWeekdays: "Пн-Пт",
        quickEveryday: "Каждый день",
        quickWeekend: "Сб-Вс",
        startLabel: "Начало",
        endLabel: "Конец",
        submit: "Добавить",
        cancel: "Отмена",
      },
    },
    errors: {
      save: "Не удалось сохранить расписание. Попробуйте ещё раз.",
      hotSlotsLocked: "Горящие окошки доступны на PRO и выше.",
    },
  },
  notifications: {
    breadcrumb: "Уведомления",
    title: "Уведомления",
    subtitle: "Всё по работе с клиентами",
    emptyTitle: "Здесь пока пусто",
    emptyBody:
      "Новые записи, отзывы и сообщения от клиентов будут появляться тут. А приглашения от студий и новости по аккаунту — на странице «Личные».",
    personalLink: "Личные уведомления",
    markAllRead: "Прочитать всё",
    markRead: "Отметить прочитанным",
    open: "Открыть",
    settingsAria: "Настройки уведомлений",
    kpi: {
      unreadLabel: "Непрочитанных",
      unreadValueTemplate: "{unread} из {total}",
      todayLabel: "Сегодня",
      todayValueTemplate: "{count} {word}",
      todayWordOne: "уведомление",
      todayWordFew: "уведомления",
      todayWordMany: "уведомлений",
      waitingLabel: "Ждут ответа",
      waitingValueTemplate: "{count} {word}",
      waitingWordOne: "запись",
      waitingWordFew: "записи",
      waitingWordMany: "записей",
      waitingNone: "Нет ожидающих",
      pushLabel: "Уведомления на телефон",
      pushOn: "Включены",
      pushOff: "Выключены",
      pushOnHint: "Приходят автоматически",
      pushOffCta: "Включить уведомления",
    },
    tabs: {
      all: "Все",
      unread: "Непрочитанные",
      newBooking: "Новые записи",
      cancelled: "Отмены",
      rescheduled: "Переносы",
      reminder: "Напоминания",
      review: "Отзывы",
      message: "Сообщения",
      system: "От платформы",
    },
    sort: {
      label: "Порядок",
      newest: "Сначала новые",
      oldest: "Сначала старые",
    },
    notice:
      "Здесь всё про клиентов и записи — то же приходит уведомлением на телефон. Приглашения, оплата и аккаунт — на странице ",
    noticeLink: "Личные уведомления",
    actions: {
      confirm: "Подтвердить",
      decline: "Отклонить",
      declinePrompt: "Причина отказа (необязательно):",
      reply: "Ответить",
      toBooking: "К записи",
      toClient: "К клиенту",
      toReview: "К отзыву",
      statusConfirmed: "Запись подтверждена",
      statusRejected: "Запись отклонена",
      statusCancelled: "Запись отменена",
      statusFinished: "Запись завершена",
      statusNoShow: "Клиент не пришёл",
      statusInProgress: "В работе",
      statusHandled: "Вы уже ответили",
    },
    timeAgoNow: "только что",
    timeAgoMinutes: "{n} мин назад",
    timeAgoHours: "{n} ч назад",
    timeAgoDays: "{n} дн назад",
    noticeSplit:
      "Здесь всё про клиентов и записи. Приглашения, оплата и аккаунт — на странице ",
    noticeSplitLink: "Личные уведомления",
    errors: {
      markRead: "Не удалось отметить прочитанным. Попробуйте ещё раз.",
      markAllRead: "Не удалось отметить все прочитанными. Попробуйте ещё раз.",
      bookingConfirm: "Не удалось подтвердить запись. Попробуйте ещё раз.",
      bookingDecline: "Не удалось отклонить запись. Попробуйте ещё раз.",
    },
  },
  reviews: {
    breadcrumb: "Отзывы",
    title: "Отзывы",
    subtitle: "Отвечайте на отзывы и слушайте клиентов — так растёт репутация",
    hero: {
      outOfFive: "/ 5",
      basedOnTemplate: "По {count} {word} · вы ответили на {rate}%",
      wordOne: "отзыве",
      wordFew: "отзывах",
      wordMany: "отзывах",
      trendUpTemplate: "+{value} за месяц",
      trendDownTemplate: "{value} за месяц",
    },
    distribution: {
      heading: "Сколько каких оценок",
      rowAria: (star: number, count: number, percent: number) =>
        `${star} звёзд: ${count} (${percent}%)`,
      rowTemplate: "{count} · {percent}%",
    },
    kpi: {
      unansweredLabel: "Без ответа",
      unansweredNone: "Все отвечены",
      responseTimeLabel: "Среднее время ответа",
      responseTimeNone: "—",
      photosLabel: "С фото",
      photosNone: "—",
    },
    filters: {
      all: "Все",
      unanswered: "Без ответа",
      good: "4–5★",
      bad: "1–3★",
    },
    card: {
      newBadge: "новый",
      unansweredBadge: "без ответа",
      answeredBadge: "ответ есть",
      replyCta: "Ответить",
      editReplyCta: "Редактировать ответ",
      reportCta: "Пожаловаться",
      reportedLabel: "Отправлено",
      replyByTemplate: "{name} · ответ от {when}",
      ownerName: "Вы",
      // STUDIO-REVIEW-MASTER-RATING: отзыв о визите в студию — отвечает студия.
      studioVisit: "визит в студию",
      studioReplyAuthor: "Студия",
    },
    reply: {
      placeholder: "Ваш ответ. Будьте вежливы — это видят все клиенты.",
      cancel: "Отмена",
      submitCreate: "Опубликовать",
      submitEdit: "Сохранить",
      savingCreate: "Публикация…",
      savingEdit: "Сохраняем…",
      quickReplies: [
        "Спасибо за отзыв 🙏",
        "Будем рады видеть снова",
        "Извините за неудобство",
      ],
      errorCreate: "Не удалось опубликовать ответ. Попробуйте ещё раз.",
      errorEdit: "Не удалось сохранить ответ. Попробуйте ещё раз.",
    },
    empty: {
      title: "Здесь пока пусто",
      bodyAll: "Когда клиенты оставят отзывы — они появятся тут.",
      bodyFiltered: "Под выбранный фильтр отзывов нет.",
      resetCta: "Сбросить фильтры",
    },
    anon: "Клиент",
    noService: "Услуга",
  },
  clients: {
    breadcrumb: "Клиенты",
    title: "Клиенты",
    subtitle: "История работы с клиентами и аналитика",
    // PERF-06: подпись окна CRM-данных. Ключ ОДИН на оба кабинета (как
    // соседний `cardNotePlaceholder` — прецедент UI-33), число приходит из
    // CRM_CLIENTS_WINDOW_MONTHS (crm/clients-window.ts) — подпись и окно
    // меняются только вместе.
    windowNote: (months: number) => {
      const mod10 = months % 10;
      const mod100 = months % 100;
      const word =
        mod10 === 1 && mod100 !== 11
          ? "месяц"
          : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
            ? "месяца"
            : "месяцев";
      return `данные за последние ${months} ${word}`;
    },
    cardNotePlaceholder: "Запишите важные детали о клиенте",
    // UI-33: ключ ОДИН на оба кабинета — дровер общий для MASTER и STUDIO
    // (как и соседний `cardNotePlaceholder`), иначе формулировки разъедутся.
    cardPhotoAltTemplate: "Фото работы для клиента {name} № {n}",
    kpi: {
      totalLabel: "Всего клиентов",
      totalSubtextTemplate: "+{count} за месяц",
      totalSubtextNone: "новых нет",
      ltvLabel: "Общая выручка",
      ltvLabelTooltip: "Сумма всех завершённых записей всех клиентов",
      ltvSubtextTemplate: "средняя {avg}",
      frequencyLabel: "Средняя частота",
      frequencySubtext: "визитов на клиента",
      retentionLabel: "Возвращаемость",
      retentionSubtext: "из новых стали постоянными",
    },
    tabs: {
      all: "Все",
      new: "Новые",
      regular: "Постоянные",
      vip: "VIP",
      sleeping: "Спящие",
    },
    sort: {
      label: "Сортировка",
      recent: "По недавним",
      alphabetical: "По алфавиту",
      ltvDesc: "По выручке",
    },
    search: {
      placeholder: "Поиск по имени или телефону",
      ariaLabel: "Поиск клиентов",
    },
    list: {
      emptyTitle: "Нет клиентов",
      emptyBody:
        "Пока никто к вам не записывался. Когда придут — появятся здесь автоматически.",
      emptyFiltered: "Под фильтр ничего не попало",
      emptyResetCta: "Сбросить фильтры",
      backToList: "К списку",
      noVisits: "Без визитов",
      visitsTemplate: "{n} {word} · последний {when}",
      visitWordOne: "визит",
      visitWordFew: "визита",
      visitWordMany: "визитов",
      rowRevenueLabel: "Выручка ₽",
    },
    status: {
      new: "Новая",
      regular: "Постоянная",
      vip: "VIP",
      sleeping: "Спящая",
      // MASTER-CLIENTS-FIX-A #7в: tooltip texts explaining the
      // auto-classification rules. Statuses come from
      // `classifyClient` — derived from booking history, not
      // manually assigned. Tooltip surfaces the underlying rule so
      // the master understands why a client landed in this bucket.
      autoHint: "Категория назначается автоматически — наведите для подробностей.",
      tooltips: {
        new: "Первый визит в течение 30 дней или ещё нет завершённых записей.",
        regular: "5 или больше завершённых записей у вас.",
        vip: "Оставил у вас от 50 000 ₽.",
        sleeping: "Был хотя бы один визит, но более 90 дней назад.",
      },
    },
    detail: {
      emptyTitle: "Выберите клиента",
      emptyBody:
        "Нажмите на клиента в списке слева — увидите его историю и заметки.",
      loadFailed: "Не удалось открыть карточку клиента. Попробуйте ещё раз.",
      contactPhone: "Телефон",
      contactEmail: "Email",
      contactTelegram: "Telegram",
      contactNone: "Без контактов",
      sourceMarketplace: "Через МастерРядом",
      sourceManual: "Добавлен вручную",
      sourceUnknown: "—",
      sinceTemplate: "с {date}",
      // MASTER-MODELS-FIX-A: CRM marker — visible only когда у клиента
      // есть >=1 неподтверждённый отклик на модельный оффер этого
      // мастера. Параллельный indicator к auto-classified `statuses`
      // badges. Tooltip объясняет смысл «они в моём pool но не были
      // выбраны — можно повторно пригласить».
      modelApplicantBadge: "Откликался на предложения для моделей",
      modelApplicantTooltipTemplate:
        "Клиент откликался на ваши модельные предложения {count} {plural}, но не был выбран. Контакт сохранён — можно пригласить снова.",
      modelApplicantPluralOne: "раз",
      modelApplicantPluralFew: "раза",
      modelApplicantPluralMany: "раз",
      copyAria: "Скопировать контакт",
      copySuccess: "Скопировано",
      // MASTER-CLIENTS-FIX-A #7в: manual tag-editor is parked in
      // backlog — auto-tagging already covers VIP/Постоянная/Новая/
      // Спящая via `classifyClient` (badges above). Surface this in
      // the tooltip so the master understands why the button is
      // disabled (it's not «работа в процессе», it's «уже есть
      // автоматическое»).
      addTagDisabled: "Категории назначаются автоматически по истории визитов.",
      addTagLabel: "метка",
      stats: {
        visits: "Визитов",
        ltv: "Выручка",
        avgCheck: "Средний чек",
        next: "Следующий визит",
      },
      notes: {
        heading: "Заметки мастера",
        empty: "Заметок пока нет",
        editLabel: "Редактировать",
        // MASTER-CLIENTS-FIX-A #6: realised in this commit — kept
        // for backwards-compatibility but no longer shown.
        editComingSoon: "Доступно скоро",
        // MASTER-CLIENTS-FIX-A #6: edit-mode UI text. Keeps the
        // tone consistent with other master cabinet edit forms
        // (settings auto-save / schedule edit etc.). Notes are
        // master-private (privacy invariant #25) — surfaced only
        // inside this master CRM card.
        editPlaceholder: "Запишите всё важное о клиенте — предпочтения, аллергии, особенности.",
        saveLabel: "Сохранить",
        saving: "Сохраняем…",
        cancelLabel: "Отменить",
        saveError: "Не удалось сохранить заметку. Попробуйте ещё раз.",
      },
      history: {
        heading: "История визитов",
        empty: "Визитов пока нет",
        allLink: "Все →",
        noRating: "без оценки",
      },
      actions: {
        openChat: "Открыть чат",
        allHistory: "Вся история",
      },
    },
  },
  modelOffers: {
    breadcrumb: "Модели",
    title: "Модели",
    subtitle:
      "Опубликуйте окошко для модели — клиенты подадут заявку, а вы выберете подходящую",
    kpi: {
      activeOffersLabel: "Открытые предложения",
      activeOffersEmpty: "Опубликуйте первый",
      pendingLabel: "Ждут решения",
      pendingEmpty: "Все рассмотрены",
      conversionLabel: "Дошли до записи",
      conversionEmpty: "—",
      archivedLabel: "В архиве",
      archivedEmpty: "—",
    },
    activeSection: {
      heading: "Открытые предложения",
      soonAction: "Создать предложение",
      soonHint: "Доступно скоро",
    },
    pendingSection: {
      heading: "Заявки на рассмотрение",
      countTemplateOne: "{count} заявка",
      countTemplateFew: "{count} заявки",
      countTemplateMany: "{count} заявок",
      filterLabel: "По предложению",
      filterAll: "Все предложения",
      filterReset: "Сбросить фильтр",
    },
    archiveSection: {
      heading: "Архив",
      countTemplateOne: "{count} предложение",
      countTemplateFew: "{count} предложения",
      countTemplateMany: "{count} предложений",
    },
    offerCard: {
      durationTemplate: "{minutes} мин",
      extraBusyTemplate: "+{minutes} мин подготовка",
      regularPriceTemplate: "обычно {price}",
      discountBadgeTemplate: "−{percent}%",
      statsTemplate: "{total} {word} · {confirmed} в записи",
      wordOne: "заявка",
      wordFew: "заявки",
      wordMany: "заявок",
      statsEmpty: "пока без заявок",
      approvedWaitingClientTemplate:
        "{count} ждут подтверждения от клиента",
      requirementsHeading: "Условия",
      requirementsEmpty: "Без особых условий",
      actions: {
        edit: "Редактировать",
        editLockedHint: "Пока есть заявки, менять нельзя",
        close: "Закрыть предложение",
        archive: "В архив",
        confirmClose: "Закрыть предложение?",
        confirmCloseWithAppsTemplate:
          "Закрыть предложение? Все заявки ({count}) будут отклонены — клиенты получат уведомление.",
        confirmArchive: "Убрать в архив? Предложение уйдёт из открытых.",
        errorClose: "Не удалось закрыть предложение. Попробуйте ещё раз.",
        errorArchive: "Не удалось убрать предложение в архив. Попробуйте ещё раз.",
      },
      status: {
        active: "Открыто",
        closed: "Закрыто",
        archived: "В архиве",
      },
    },
    applicationCard: {
      photosLabel: "Фото-портфолио",
      // UI-33: заголовок полоски — обычный <p>, с картинками программно не
      // связан, поэтому каждая миниатюра была для скринридера немой.
      photoAltTemplate: "Фото-портфолио из заявки № {n}",
      photosEmpty: "Без фото",
      consentYes: "Согласие на съёмку",
      consentNo: "Без согласия на съёмку",
      offerLinkTemplate: "К окошку {date} · {time}",
      actions: {
        approveQuick: "Одобрить как есть",
        approveWithTime: "Одобрить и предложить время",
        reject: "Отклонить",
        chat: "Написать клиенту",
        chatComingSoon: "Чат скоро появится",
        errorApprove: "Не удалось одобрить заявку. Попробуйте ещё раз.",
      },
      statusBadges: {
        pending: "Ждёт решения",
        approvedWaitingClient: "Ждём клиента",
        confirmed: "В записи",
        rejected: "Отклонена",
      },
    },
    modals: {
      create: {
        title: "Новое предложение для модели",
        subtitle:
          "Опубликуйте окно — клиенты подадут заявку и приложат фото-портфолио.",
        serviceLabel: "Услуга",
        servicePlaceholder: "— Выберите услугу —",
        serviceMetaTemplate: "{minutes} мин · обычно {price}",
        serviceMetaNoPrice: "{minutes} мин",
        dateLabel: "Дата",
        datePlaceholder: "ГГГГ-ММ-ДД",
        timeStartLabel: "Начало окошка",
        timeEndLabel: "Конец окошка",
        priceLabel: "Цена для модели",
        pricePlaceholder: "₽ — оставьте пустым, если бесплатно",
        freeHint: "Бесплатно для модели",
        discountHintTemplate: "Скидка {percent}% от обычной цены",
        requirementsLabel: "Условия (необязательно)",
        requirementsPlaceholder: "Например: натуральные ногти",
        // FIX-OFFER-REQUIREMENTS: прежняя формулировка читалась как «без
        // Enter условие не считается» — и ровно так себя и вёл код: текст,
        // не подтверждённый Enter'ом, пропадал при отправке. Теперь он
        // дописывается сам, и подсказка про Enter говорит про СЛЕДУЮЩЕЕ
        // условие, а не про обязательный шаг.
        requirementsHelp:
          "Не больше пяти условий. Enter — чтобы добавить следующее.",
        submit: "Создать предложение",
        submitting: "Создание…",
        cancel: "Отмена",
        errorCreate: "Не удалось создать предложение. Попробуйте ещё раз.",
      },
      edit: {
        title: "Изменить предложение",
        subtitle: "Изменения сразу увидят все, кто подаст заявку.",
        submit: "Сохранить",
        submitting: "Сохраняем…",
        errorUpdate: "Не удалось обновить предложение. Попробуйте ещё раз.",
      },
      reject: {
        title: "Отклонить заявку",
        subtitleTemplate:
          "Клиент {name} получит уведомление с указанной причиной.",
        reasonLabel: "Причина",
        reasonChips: {
          experience: "Не подходит по опыту",
          photos: "Недостаточно фото",
          time: "Время не подходит",
          other: "Другое",
        },
        customLabel: "Опишите причину",
        customPlaceholder: "Будьте вежливы — это видит клиент",
        submit: "Отклонить заявку",
        submitting: "Отклонение…",
        cancel: "Отмена",
        errorReject: "Не удалось отклонить заявку. Попробуйте ещё раз.",
      },
      proposeTime: {
        title: "Предложить время",
        subtitleTemplate: "Клиент {name} получит уведомление о предложении.",
        offerLabel: "Окно",
        offerLineTemplate: "{date} · {start}–{end}",
        slotsLabel: "Свободные окошки (30 мин)",
        slotsLoading: "Загрузка…",
        slotsEmpty:
          "В этом окошке свободного времени нет. Закройте предложение или измените время.",
        slotsLoadFailed: "Не удалось загрузить свободное время. Попробуйте ещё раз.",
        footnote:
          "Клиент подтвердит время — и запись создастся сама.",
        submit: "Предложить время",
        submitting: "Отправка…",
        cancel: "Отмена",
        errorPropose: "Не удалось предложить время. Попробуйте ещё раз.",
      },
      confirmDelete: {
        remove: "Удалить",
      },
    },
    empty: {
      offersTitle: "Здесь пока пусто",
      offersBody:
        "Когда опубликуете первое предложение для моделей — оно появится здесь. У каждого предложения вы увидите заявки клиентов и сможете выбрать подходящую.",
      applicationsTitle: "Нет новых заявок",
      applicationsBody:
        "Открытые предложения есть, но заявок пока не пришло. Поделитесь ссылкой в соцсетях — это ускорит отклик.",
      applicationsBodyFiltered:
        "Под выбранный фильтр заявок пока нет. Попробуйте сбросить фильтр или посмотреть другие предложения.",
    },
  },
  analytics: {
    breadcrumb: "Аналитика",
    title: "Аналитика",
    subtitle: "Как идут дела и что можно улучшить",
    period: {
      chips: {
        d7: "7 дней",
        d30: "30 дней",
        d90: "Квартал",
        year: "Год",
        custom: "Свой период",
      },
      comparisonLabel: "Сравнивать с прошлым периодом",
      periodLabel: "Период",
      customPickerHeading: "Свой период",
      customFromLabel: "С",
      customToLabel: "По",
      customApply: "Применить",
      customCancel: "Отмена",
    },
    kpi: {
      revenueLabel: "Выручка",
      bookingsLabel: "Записей",
      avgCheckLabel: "Средний чек",
      utilizationLabel: "Загрузка",
      prevTemplate: "было {value}",
      prevNoData: "нет данных за прошлый период",
      ppShort: "пунктов",
      ofMaxHint: "от самого загруженного времени",
    },
    revenue: {
      heading: "Динамика выручки",
      legendCurrent: "Текущий период",
      legendPrevious: "Прошлый",
      vsTemplate: "было {value}",
      emptyTitle: "Пока нет выручки",
      emptyBody: "Когда появятся завершённые записи — здесь будет график.",
    },
    heatmap: {
      heading: "Загрузка по дням и часам",
      subtitle: "Видно, когда густо, а когда пусто",
      labelHint: "Относительно пика за период",
      legendLow: "0%",
      legendHigh: "100%",
      insightTemplate:
        "Свободные окошки в {weekday} {hour} стабильно пустуют. Запустить акцию?",
      emptyTitle: "Нет данных",
      emptyBody: "Когда появятся записи — здесь будет карта загрузки.",
      weekdayColumnAria: "День недели",
    },
    topServices: {
      heading: "Топ услуг по выручке",
      subtitleTemplate: "За {period}",
      bookingsLabel: "записей",
      emptyTitle: "Нет данных",
      emptyBody: "За выбранный период не было завершённых записей.",
    },
    lock: {
      title: "Доступно в PRO",
      body: "Получите расширенную аналитику — доход, услуги, карта загрузки.",
      cta: "Перейти на PRO",
    },
    funnel: {
      heading: "Воронка клиента",
      subtitleTemplate: "От первой записи до постоянного клиента · {period}",
      stages: {
        booked: "Записались",
        finished: "Пришли (1-й визит)",
        returned: "Вернулись (2-й визит)",
        regular: "Стали постоянными",
      },
      fromPreviousTemplate: "{value}% от предыдущего шага",
      emptyTitle: "Нет данных",
      emptyBody: "За выбранный период не было новых записей.",
    },
    insights: {
      heading: "Что говорят данные",
      periodTemplate: "· {period}",
      rules: {
        heatmap_gap_title: "Свободные окошки",
        heatmap_gap_body:
          "{weekday} {hour} — стабильно пустует. Запустить акцию или горящее окошко?",
        top_service_growing_title: "Топ-услуга растёт",
        top_service_growing_body:
          "«{name}» приносит {share}% выручки, +{growthPct}% к прошлому периоду. Можно поднять цену.",
        retention_drop_title: "Возвращаемость просела",
        retention_drop_body:
          "Только {currentPct}% клиентов возвращаются на 2-й визит. Раньше было {prevPct}%. Подумайте, что можно улучшить после первого визита.",
        avg_check_decline_title: "Средний чек снижается",
        avg_check_decline_body:
          "Средний чек упал на {declinePct}% к прошлому периоду. Возможно, много скидок или дешёвых услуг.",
        cancellation_high_title: "Много отмен",
        cancellation_high_body:
          "{cancelPct}% записей отменено за период. Подумайте про окно отмены или предоплату.",
      },
    },
  },
  profile: {
    breadcrumb: "Профиль",
    title: "Профиль",
    subtitle: "Что видят клиенты в каталоге и на странице записи",
    sidebar: {
      completionLabel: "Заполнено",
      sectionsHeading: "Разделы профиля",
      tipEyebrow: "Совет",
      tipBody:
        "Полный профиль показывается выше в каталоге и собирает больше записей.",
    },
    nav: {
      header: "Шапка профиля",
      contacts: "Контакты",
      about: "О себе",
      location: "Локация",
      services: "Услуги и цены",
      portfolio: "Портфолио",
    },
    preview: {
      eyebrow: "Глазами клиента",
      title: "Скоро покажем вашу карточку",
      body:
        "Здесь будет видно, как ваша карточка выглядит для клиентов в каталоге и на странице записи. Появится совсем скоро.",
      footnote: "Будет обновляться сама, как только вы что-то поменяете",
    },
    editable: {
      savingLabel: "Сохраняется",
      savedLabel: "Сохранено",
      emptyValue: "Не заполнено",
      editAriaLabel: "Редактировать",
      cancelAriaLabel: "Отмена",
      errorMessage: "Не удалось сохранить. Попробуйте ещё раз.",
    },
    header: {
      title: "Шапка профиля",
      nameLabel: "Имя для клиентов",
      taglineLabel: "Чем занимаетесь",
      taglinePlaceholder: "Например: мастер маникюра и педикюра",
      usernameLabel: "Адрес вашей страницы",
      usernamePrefix: "masterryadom.ru/u/",
      usernameNotSet: "Будет задан автоматически",
      usernamePlaceholder: "anna-master",
      usernameHint:
        "От 3 до 32 знаков: английские буквы, цифры и дефис. Без пробелов и подчёркиваний.",
      usernameSaveCta: "Сохранить",
      usernameCancelCta: "Отмена",
      usernameUnchangedHint: "Новый никнейм совпадает с текущим.",
      usernameConfirmTitle: "Изменить никнейм?",
      usernameConfirmMessageTemplate:
        "Новый адрес — masterryadom.ru/u/{username}. Старая ссылка будет автоматически перенаправлять на новую. Мы помним до 10 прошлых адресов — самые старые со временем перестанут открываться.",
      usernameConfirmCta: "Изменить никнейм",
      usernameErrorTaken: "Этот никнейм уже занят. Попробуйте другой.",
      usernameErrorGeneric: "Не удалось сохранить никнейм. Попробуйте ещё раз.",
    },
    contacts: {
      title: "Контакты",
      subtitle: "Видны клиентам только после подтверждения записи",
      phoneLabel: "Телефон",
      phonePlaceholder: "+7 (___) ___-__-__",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      telegramLabel: "Telegram",
      vkLabel: "ВКонтакте",
      verifiedLabel: "Подтверждён",
      connectedLabel: "Подключён",
      notSetLabel: "Не задан",
      // PWA-FIX-03: Telegram и ВКонтакте в этой секции — статус привязки
      // АККАУНТА, а не поле ввода, и привязка живёт в кабинете клиента.
      // Без этой ссылки строка выглядела нередактируемой и необъяснимой
      // (жалоба владельца: «нельзя заполнить вконтакте или он из кабинета
      // клиента прокидывается?»). Ссылка на страницу ВК — отдельное поле в
      // секции «Соцсети», её эта строка не заменяет.
      linkAction: "Привязать",
      accountFootnoteText: "Эти поля редактируются в",
      accountFootnoteCta: "настройках аккаунта",
      // PHONE-CLAIM-01: прежний текст обещал «здесь не меняется» — теперь
      // номер редактируется (заявка без SMS-подтверждения, см.
      // lib/auth/phone-claim.ts), и подсказка описывает ровно это.
      phoneVerifyHint:
        "Номер сохраняется в вашем аккаунте. Подтвердить его можно через ВКонтакте или Яндекс ID — там, где он привязан.",
      phoneVerifiedLabel: "Номер подтверждён",
      phoneIncomplete: "Введите номер полностью: +7 (900) 000-00-00.",
    },
    about: {
      title: "О себе",
      subtitle: "2–3 предложения о вашем подходе и опыте",
      placeholder: "Расскажите коротко о вашем подходе и опыте",
      counterTemplate: "{value} / {max}",
      counterMax: "600",
    },
    location: {
      title: "Локация",
      subtitle: "Где принимаете клиентов",
      cityLabel: "Город",
      cityAutoHint: "Определяется по адресу",
      cityNotSet: "Не задан",
      districtLabel: "Район",
      districtPlaceholder: "Например: Тверской район",
      addressLabel: "Адрес",
      addressPlaceholder: "Введите адрес",
      addressSuggestEmpty: "Ничего не нашлось",
      addressSuggestFailed: "Не удалось загрузить подсказки адреса. Попробуйте ещё раз.",
      mapMissingTitle: "Адрес не указан",
      mapMissingBody: "Заполните адрес, чтобы клиенты увидели вас на карте.",
      timezoneLabel: "Часовой пояс",
      timezoneAutoHint: "Обычно берём из города",
      timezoneHint:
        "Время записей, напоминаний и расписания показываем по этому поясу. Обычно определяется по адресу — измените, если нужно.",
      timezoneSaving: "Сохраняем…",
      timezoneSaved: "Сохранено",
      timezoneError: "Не удалось сохранить часовой пояс. Попробуйте ещё раз.",
    },
    services: {
      title: "Услуги и цены",
      subtitleTemplate: "{count} услуг в {categories} категориях",
      subtitleSingleCategory: "{count} услуг в 1 категории",
      subtitleEmpty: "Пока нет включённых услуг",
      manageCta: "Управлять услугами",
      emptyTitle: "Добавьте первую услугу",
      emptyBody: "Без услуг клиенты не смогут записаться. Это занимает 30 секунд.",
      emptyCta: "Перейти к услугам",
      countTemplate: "{count}",
      priceMissing: "цена скрыта",
    },
    portfolio: {
      title: "Портфолио",
      subtitleTemplate: "{total} работ, {publicCount} в каталоге",
      subtitleEmpty: "Покажите ваши работы клиентам",
      manageCta: "Управлять",
      emptyTitle: "Добавьте первую работу",
      emptyBody:
        "Клиенты охотнее записываются к мастерам с примерами работ.",
      emptyCta: "Добавить работу",
      hiddenBadge: "скрыто",
      imageAltTemplate: "Работа из портфолио № {n}",
    },
  },
  portfolioPage: {
    breadcrumb: "Портфолио",
    title: "Портфолио",
    subtitle: "Покажите ваши работы клиентам",
    addCta: "Добавить работы",
    kpi: {
      totalLabel: "Всего работ",
      publicLabel: "В каталоге",
      hiddenLabel: "Скрытые",
    },
    filters: {
      all: "Все",
      public: "В каталоге",
      hidden: "Скрытые",
      byCategoryLabel: "По категориям",
      allCategories: "Все",
    },
    card: {
      hiddenBadge: "скрыта",
      // CATALOG-MAIN-PHOTO: первая публичная работа — обложка карточки каталога.
      coverBadge: "Главное фото",
      menuAria: "Ещё действия с работой",
      // UI-33: номер работы делает плитки различимыми. Без него сетка из N
      // работ звучит как N одинаковых кнопок «Изменить», а `aria-label`
      // кнопки перекрывает `alt` вложенной картинки — то есть один alt
      // до пользователя тут не доходит.
      editAriaTemplate: "Изменить работу № {n}",
      deleteAriaTemplate: "Удалить работу № {n}",
      imageAltTemplate: "Работа из портфолио № {n}",
    },
    menu: {
      makeCover: "Сделать главным",
      makeCoverError: "Не удалось сделать фото главным. Попробуйте ещё раз.",
      hide: "Скрыть из каталога",
      show: "Показать в каталоге",
      moveEarlier: "Переместить раньше",
      moveLater: "Переместить позже",
    },
    empty: {
      title: "Добавьте первую работу",
      body:
        "Клиенты охотнее записываются к мастерам с примерами работ. Чем больше работ — тем больше доверия.",
      cta: "Добавить работы",
      tip1: "Обычные фото с телефона",
      tip2: "До 10 МБ",
      tip3: "Несколько за раз",
    },
    upload: {
      title: "Добавить работы",
      dropZoneTitle: "Перетащите фото сюда",
      dropZoneSubtitle: "или нажмите, чтобы выбрать",
      dropZoneActive: "Отпустите, чтобы добавить",
      selectFileCta: "Выбрать фото",
      defaultCategoryLabel: "Категория для всех фото",
      defaultCategoryHint: "Можно изменить для каждой работы отдельно",
      defaultCategoryNone: "— Без категории —",
      defaultPublicLabel: "Сразу показывать в каталоге",
      previewRemoveAria: "Убрать фото",
      // UI-33: имя файла нигде не отрисовано — оно есть только в самой
      // миниатюре, поэтому очередь из трёх фото звучала как три пустых
      // элемента с одинаковой кнопкой удаления.
      previewAltTemplate: "Предпросмотр файла {name}",
      progressTemplate: "Загружено {done} из {total}",
      cancel: "Отмена",
      submit: "Загрузить",
      submitTemplate: "Загрузить ({count})",
      submitting: "Загрузка…",
      errorUpload: "Не удалось загрузить файл. Попробуйте ещё раз.",
      errorSize: "Файл больше 10 МБ — выберите поменьше.",
      errorType: "Подойдут обычные фото — JPG, PNG или WebP.",
    },
    edit: {
      title: "Редактирование работы",
      photoLabel: "Фото",
      // UI-33: `photoLabel` — обычный <p>, программной связи с картинкой у
      // него нет, поэтому у самого фото должно быть своё имя.
      photoAlt: "Фото редактируемой работы",
      cropCta: "Обрезать",
      replaceCta: "Заменить",
      replacing: "Загружаем…",
      errorReplace: "Не удалось заменить фото. Попробуйте ещё раз.",
      errorReplaceSize: "Файл больше 10 МБ — выберите поменьше.",
      errorReplaceType: "Подойдут обычные фото — JPG, PNG или WebP.",
      categoryLabel: "Категория",
      categoryNone: "— Без категории —",
      servicesLabel: "Связанные услуги",
      servicesEmpty: "Не выбраны",
      tagsLabel: "Метки",
      tagsPlaceholder: "Например: френч",
      tagsHelp:
        "Подсказываем метки, которые вы уже ставили. Новые можно будет добавить скоро.",
      tagsNoResults: "Нет совпадений",
      isPublicLabel: "Показывать в каталоге",
      deleteCta: "Удалить работу",
      confirmDelete: "Удалить эту работу из портфолио?",
      cancel: "Отмена",
      submit: "Сохранить",
      submitting: "Сохраняем…",
      errorUpdate: "Не удалось сохранить. Попробуйте ещё раз.",
      errorDelete: "Не удалось удалить. Попробуйте ещё раз.",
    },
    crop: {
      title: "Обрезать фото",
      cancel: "Отмена",
      submit: "Сохранить",
      submitting: "Сохраняем…",
      errorCrop: "Не удалось сохранить обрезку. Попробуйте ещё раз.",
    },
    reorder: {
      errorMessage: "Не удалось изменить порядок. Попробуйте ещё раз.",
    },
  },
  account: {
    breadcrumb: "Настройки аккаунта",
    title: "Настройки аккаунта",
    subtitle: "Личное — недоступно клиентам",
    tabs: {
      navAria: "Разделы аккаунта",
      notifications: "Уведомления",
      security: "Безопасность",
      account: "Аккаунт",
    },
    notifications: {
      channelsHeading: "Куда присылать уведомления",
      // FIX-EXTERNAL-GATING-01 (G-2): provider-neutral — the individual
      // channel rows below are each flag-gated, so the intro must not name a
      // specific provider (which could be a killed/disabled one).
      channelsSubtitle:
        "Выберите, куда присылать оповещения о записях, отзывах и оплатах.",
      perEventTitle: "Что именно присылать",
      perEventBody:
        "Скоро здесь можно будет выбирать, что и куда приходит.",
    },
    security: {
      identityHeading: "Контакты для входа",
      phoneLabel: "Телефон",
      emailLabel: "Email",
      verifiedBadge: "Подтверждён",
      notSetLabel: "Не задан",
      changeSoonHint: "Скоро · потребуется подтверждение",
      connectionsHeading: "Связанные аккаунты",
      // FIX-EXTERNAL-GATING-01 (G-2): the subtitle names ONLY the external
      // providers currently enabled — built from the same flags the rows gate
      // on, so it can never advertise a killed/disabled provider. Joined with
      // «или» when more than one is enabled.
      connectionsSubtitle: (providers: string[]) =>
        `Привяжите ${providers.join(" или ")} — для входа и оповещений.`,
      connectionsProviderNames: { telegram: "Telegram", vk: "ВКонтакте" },
      // CONSOLIDATE-EXTERNAL-LINKING-01: connect/disconnect live in ONE place —
      // the profile «Связанные аккаунты» card. The security tab points there;
      // delivery toggles stay in the Notifications tab.
      connectionsManageInProfile:
        "Подключение и отключение аккаунтов — в вашем профиле, для входа и оповещений.",
      connectionsOpenProfile: "Открыть профиль",
      // COPY-BEAUTY-01 — «сессия» в бьюти-продукте читается как сеанс у
      // мастера (см. «бесплатные сессии» у модель-офферов), поэтому здесь —
      // «входы» и «устройства», без «разлогинит».
      sessionsHeading: "Где вы вошли",
      sessionsCountTemplateOne: "{count} активный вход",
      sessionsCountTemplateFew: "{count} активных входа",
      sessionsCountTemplateMany: "{count} активных входов",
      sessionsBody:
        "Кнопка «Выйти на других устройствах» завершит вход везде, кроме этого устройства — например, если вы заходили с чужого телефона и забыли выйти. Подробный список устройств появится позже.",
      revokeOthersCta: "Выйти на других устройствах",
      revokeOthersConfirm:
        "Выйти на всех других устройствах? На этом устройстве вы останетесь.",
      revokeOthersError: "Не удалось выйти на других устройствах. Попробуйте ещё раз.",
      revokeOthersSuccessTemplate: "Готово — вышли на других устройствах: {count}",
      revokeOthersOnlyCurrent: "Других входов не найдено.",
    },
    account: {
      planHeading: "Тариф",
      planTierFree: "FREE",
      planTierPro: "PRO",
      planTierPremium: "PREMIUM",
      planTierUnknown: "Тариф",
      planActiveUntilTemplate: "Активен до {date}",
      planActiveIndefinite: "Без срока окончания",
      planAutoRenewOn: "Автопродление включено",
      planAutoRenewOff: "Автопродление выключено",
      planFreeBody:
        "Вы используете бесплатный тариф. Перейдите на PRO для расширенной аналитики, горящих окошек и онлайн-оплаты.",
      manageBillingCta: "Управлять подпиской",
      rolesHeading: "Роли",
      rolesActiveLabel: "Активные роли",
      roleClient: "Клиент",
      roleMaster: "Мастер",
      roleStudio: "Студия",
      roleStudioAdmin: "Админ студии",
      roleAdmin: "Администратор",
      roleSuperadmin: "Главный администратор",
      manageRolesCta: "Управлять ролями",
      exportHeading: "Копия ваших данных",
      exportBody:
        "Скоро вы сможете запросить копию всех своих данных одним файлом: профиль, записи, отзывы, портфолио.",
      exportSoonCta: "Скоро",
      dangerZoneHeading: "Необратимые действия",
      // CABINET-DELETE-SCOPE-01: карточка удаляет КАБИНЕТ мастера, а не
      // аккаунт — удаление аккаунта целиком живёт в /cabinet/settings.
      dangerZoneTitle: "Удаление кабинета мастера",
      dangerZoneBody:
        "Удалятся профиль мастера, услуги, расписание и портфолио, а ваша страница пропадёт из каталога. Аккаунт останется: вход, ваши записи к другим мастерам и студия, если она у вас есть.",
      dangerZoneCta: "Удалить кабинет мастера",
      accountDeletionHint: "Удалить аккаунт целиком, со всеми кабинетами, можно в",
      accountDeletionLink: "настройках аккаунта",
    },
  },
  servicesPage: {
    breadcrumb: "Услуги и цены",
    title: "Услуги и цены",
    subtitle: "Что предлагаете клиентам и за сколько",
    // UI-18: подпись оставлена короткой — обе кнопки стоят в шапке рядом, и
    // на 390px удлинение обеих сжимает заголовок страницы до нечитаемого
    // огрызка (замерено скриншотами до/после). Действие называет `aria-label`:
    // видимая подпись входит в него целиком, поэтому WCAG 2.5.3 соблюдён, а
    // скринридер перестаёт объявлять «кнопка Услуга».
    addServiceCta: "Услуга",
    addServiceAria: "Добавить услугу",
    addBundleCta: "Пакет",
    addBundleAria: "Добавить пакет",
    kpi: {
      servicesLabel: "Услуг",
      bundlesLabel: "Пакетов",
      disabledLabel: "Отключено",
    },
    filters: {
      all: "Все",
      services: "Услуги",
      bundles: "Пакеты",
      disabled: "Отключённые",
    },
    categoryAccordion: {
      addServiceLink: "Добавить услугу в эту категорию",
      uncategorisedName: "Без категории",
    },
    bundlesAccordion: {
      heading: "Пакеты",
    },
    row: {
      moveUpAria: "Переместить выше",
      moveDownAria: "Переместить ниже",
      menuAria: "Действия",
      editAriaLabel: "Изменить",
      disabledBadge: "Отключена",
      bundleDisabledBadge: "Отключён",
      bundleWarning: "Одна из услуг отключена",
    },
    menu: {
      edit: "Редактировать",
      enable: "Включить",
      disable: "Отключить",
      delete: "Удалить",
    },
    empty: {
      title: "Добавьте первую услугу",
      body:
        "Без услуг клиенты не могут записаться. Начните с самой популярной — потом добавите остальные и пакеты.",
      cta: "Добавить услугу",
    },
    durationFormat: {
      minutesShort: "мин",
      hoursShort: "ч",
    },
    bundleRow: {
      sumLabel: "Сумма",
      discountLabel: "Скидка",
      finalLabel: "Итого",
    },
    service: {
      title: {
        create: "Новая услуга",
        edit: "Редактирование услуги",
      },
      nameLabel: "Название",
      namePlaceholder: "Например: маникюр аппаратный",
      categoryLabel: "Категория",
      categoryNone: "— Без категории —",
      categoryPendingSuffix: "(на одобрении)",
      categoryCreateCta: "Создать новую категорию",
      categoryCreatePlaceholder: "Например: эпиляция воском",
      categoryCreateSubmit: "Добавить",
      categoryCreateCancel: "Отмена",
      categoryCreateSubmitting: "Отправляем…",
      categoryCreatedToast:
        "Категория отправлена на одобрение. Вы можете использовать её сразу.",
      categoryCreateFailed:
        "Не удалось создать категорию. Попробуйте ещё раз.",
      categoryCreateEmpty: "Введите название категории.",
      durationLabel: "Длительность",
      priceLabel: "Цена, ₽",
      pricePlaceholder: "1500",
      descriptionLabel: "Описание (необязательно)",
      descriptionPlaceholder: "Расскажите про материалы, технику и особенности",
      isEnabledLabel: "Доступна для записи",
      onlinePaymentLabel: "Принимать онлайн-оплату",
      onlinePaymentLockedHint: "Доступно в PRO",
      deleteCta: "Удалить",
      confirmDelete: "Удалить услугу? Если на неё уже записаны — лучше отключите.",
      cancel: "Отмена",
      submitCreate: "Создать",
      submitEdit: "Сохранить",
      submitting: "Сохраняем…",
      errorCreate: "Не удалось создать услугу. Попробуйте ещё раз.",
      errorUpdate: "Не удалось сохранить. Попробуйте ещё раз.",
      errorDelete: "Не удалось удалить. Попробуйте ещё раз.",
      errorHasBookings:
        "Услугу нельзя удалить — на неё уже записаны. Отключите её.",
    },
    bundle: {
      title: {
        create: "Новый пакет",
        edit: "Редактирование пакета",
      },
      nameLabel: "Название пакета",
      namePlaceholder: "Например: манипедикюр",
      servicesLabel: "Услуги в пакете",
      servicesHint: "минимум 2",
      servicesEmpty: "Сначала создайте услуги",
      discountLabel: "Скидка",
      discountTypeLabel: "Скидка в",
      discountTypePercent: "%",
      discountTypeFixed: "₽",
      previewSumLabel: "Сумма услуг",
      previewDiscountLabel: "Скидка",
      previewFinalLabel: "Итого",
      previewDurationLabel: "Длительность",
      isEnabledLabel: "Доступен для записи",
      deleteCta: "Удалить",
      confirmDelete: "Удалить пакет?",
      cancel: "Отмена",
      submitCreate: "Создать пакет",
      submitEdit: "Сохранить",
      submitting: "Сохраняем…",
      errorCreate: "Не удалось создать пакет. Попробуйте ещё раз.",
      errorUpdate: "Не удалось сохранить. Попробуйте ещё раз.",
      errorDelete: "Не удалось удалить пакет. Попробуйте ещё раз.",
    },
    reorder: {
      errorMessage: "Не удалось изменить порядок. Попробуйте ещё раз.",
    },
  },
  schedule: {
    breadcrumb: "Расписание",
    title: "Расписание",
    subtitleTemplate: "{range} · {bookingsLabel} · {revenue}",
    bookingsLabelOne: "запись",
    bookingsLabelFew: "записи",
    bookingsLabelMany: "записей",
    controls: {
      // PWA-UX-BATCH-01: «Месяц» снят (был заглушкой, выглядел нажимаемым);
      // день — рабочий вид, для телефона — по умолчанию.
      viewDay: "День",
      viewWeek: "Неделя",
      prevWeek: "Предыдущая неделя",
      nextWeek: "Следующая неделя",
      prevDay: "Предыдущий день",
      nextDay: "Следующий день",
      dayStripAria: "Дни недели",
      today: "Сегодня",
      refresh: "Обновить",
      // PWA-FIX-05 — подписанная кнопка входа в настройки со страницы
      // расписания (CTA-инфинитив: действие со страницы, не имя раздела).
      settings: "Настроить расписание",
    },
    kpi: {
      weekBookings: "Записей на неделе",
      // PWA-UX-BATCH-01: короткие подписи для плиток 4-в-ряд на телефоне.
      weekBookingsShort: "Записей",
      freeTodayShort: "Свободно",
      weekRevenue: "Доход",
      load: "Загрузка",
      loadHoursTemplate: "из {hours} ч",
      freeToday: "Свободно сегодня",
      freeTodaySlotOne: "окошко",
      freeTodaySlotFew: "окошка",
      freeTodaySlotMany: "окошек",
      freeTodayAfterTemplate: "после {time}",
      freeTodayNone: "нет окошек",
    },
    legend: {
      confirmed: "Подтверждено",
      pending: "Ожидает",
      newClient: "Новый клиент",
      blocked: "Закрыто",
    },
    dayOff: "Выходной",
    timeBlockBreak: "Перерыв",
    timeBlockBlocked: "Закрыто",
    footerHintCreate: "Нажмите на свободное место, чтобы добавить запись",
    footerUpdatedTemplate: "обновлено в {time}",
    bookingCard: {
      newBadge: "Новая",
      actionsAria: "Действия",
      confirm: "Подтвердить",
      decline: "Отклонить",
      reschedule: "Перенести",
      cancel: "Отменить",
      chat: "Чат с клиентом",
      declinePrompt: "Укажите причину отказа — она будет отправлена клиенту:",
      cancelPrompt: "Укажите причину отмены — она будет отправлена клиенту:",
      actionError: "Не удалось обновить запись. Попробуйте ещё раз.",
      awaitingClientResponse:
        "Запрос переноса отправлен — ждём ответ клиента.",
      declineTitle: "Отклонить запись",
      declineLabel: "Причина отказа",
      declinePlaceholder: "Например: «Конфликт по времени»",
      declineConfirmLabel: "Отклонить",
      cancelTitle: "Отменить запись",
      cancelLabel: "Причина отмены",
      cancelPlaceholder: "Например: «Заболела, переношу на следующую неделю»",
      cancelConfirmLabel: "Отменить запись",
    },
    reschedule: {
      modalTitle: "Перенести запись",
      currentLabel: "Текущее время",
      durationLabel: "Длительность услуги — {N} мин",
      newDateLabel: "Новая дата",
      newTimeLabel: "Новое время",
      cancel: "Отмена",
      submit: "Перенести",
      commentLabel: "Комментарий клиенту (необязательно)",
      commentPlaceholder: "Например: «Перенесла на час позже из-за форс-мажора»",
      submitting: "Переносим…",
      conflictError: "Это время занято — выберите другое.",
      genericError: "Не удалось перенести запись. Попробуйте ещё раз.",
      contextLoading: "Загружаем запись…",
      contextError: "Не удалось загрузить запись. Попробуйте обновить страницу.",
      slotsLoading: "Загружаем свободные окошки…",
      slotsError: "Не удалось загрузить свободные окошки. Попробуйте ещё раз.",
      noSlots: "Свободных окошек в этот день нет. Попробуйте другую дату.",
      pendingTitle: "Вы уже предложили перенос этой записи",
      pendingBody:
        "Дождитесь ответа клиента — пока он не ответил, новый перенос отправить нельзя.",
    },
    emptyCellHint: "+ Запись",
  },
  bookings: {
    breadcrumb: "Записи",
    title: "Записи",
    subtitle: "От заявки до завершённой записи",
    toolbar: {
      searchPlaceholder: "Поиск по клиенту или услуге",
      tabAll: "Все",
      tabNew: "Новые клиенты",
      tabRegular: "Постоянные",
      statTotal: "Всего",
      statPending: "В ожидании",
      statConfirmed: "Подтверждено",
    },
    columns: {
      pending: { title: "Ждут подтверждения", hint: "Ответьте в течение 30 минут" },
      confirmed: { title: "Подтверждены", hint: "Готовы к визиту" },
      today: { title: "Сегодня", hint: "В работе" },
      done: { title: "Завершены", hint: "Запросить отзыв" },
      cancelled: { title: "Отменены", hint: "За 30 дней" },
    },
    card: {
      newBadge: "Новая",
      inProgressBadge: "В работе",
      confirm: "Подтвердить",
      decline: "Отклонить",
      reschedule: "Перенести",
      rescheduleAwaitingTooltip:
        "Уже есть запрос переноса в ожидании ответа — новый отправить нельзя.",
      awaitingClientResponse:
        "Запрос переноса отправлен — ждём ответ клиента.",
      cancel: "Отменить",
      cancelPrompt: "Укажите причину отмены — она будет отправлена клиенту:",
      cancelTitle: "Отменить запись",
      cancelLabel: "Причина отмены",
      cancelPlaceholder: "Например: «Заболела, переношу на следующую неделю»",
      cancelConfirmLabel: "Отменить запись",
      declineTitle: "Отклонить запись",
      declineLabel: "Причина отказа",
      declinePlaceholder: "Например: «Конфликт по времени»",
      declineConfirmLabel: "Отклонить",
      cancelError: "Не удалось отменить запись. Попробуйте ещё раз.",
      reviewLabelTemplate: "★ {rating} · отзыв оставлен",
      guestClient: "Без аккаунта",
      // RESCHEDULE-CURRENT-TIME: запрошенное клиентом время под текущим.
      proposedWhenPrefix: "Перенос на",
      // RESCHEDULE-DECLINE-NOTIFY-01: ответ на запрос переноса от клиента —
      // это ответ про ВРЕМЯ, а не про запись: запись остаётся в любом случае.
      acceptReschedule: "Принять перенос",
      keepOriginalTime: "Оставить прежнее время",
      keepOriginalTitle: "Оставить прежнее время?",
      keepOriginalMessage:
        "Клиент просил перенести запись. Запись останется на прежнем времени, клиент получит уведомление.",
      // NO-SHOW-UI: действие доступно от начала приёма до часа после конца.
      noShow: "Отметить неявку",
      noShowTitle: "Клиент не пришёл?",
      noShowMessage:
        "Запись отметится неявкой, клиент получит уведомление. Снять отметку потом нельзя.",
      noShowConfirmLabel: "Отметить неявку",
      noShowError: "Не удалось отметить неявку. Попробуйте ещё раз.",
      noShowBadge: "Не пришёл",
      // BOOKING-FLOW-AUDIT-RESIDUALS: компонент пакета отменяется только
      // вместе со всем пакетом (инв. #34).
      packageCancelTitle: "Отменить весь пакет?",
      packageCancelMessage:
        "Эта запись — часть пакета, а пакет отменяется только целиком. Отменятся все его записи, клиент получит уведомление.",
      packageCancelConfirm: "Отменить пакет",
      packageCancelError: "Не удалось отменить пакет. Попробуйте ещё раз.",
    },
    empty: "Пока пусто",
    declineReasonPrompt: "Укажите причину отказа — она будет отправлена клиенту:",
    declineError: "Не удалось отклонить запись. Попробуйте ещё раз.",
    confirmError: "Не удалось подтвердить запись. Попробуйте ещё раз.",
  },
  userChip: {
    trialStatusTemplate: "PREMIUM · {days} дн.",
    planLabels: {
      free: "FREE",
      pro: "PRO",
      premium: "PREMIUM",
    },
  },
  dashboard: {
    // QA-115 (FIX-06): studio context for a studio master (null for independent).
    studioChipTemplate: "Студия «{name}»",
    hero: {
      nextClientLabel: "Следующий клиент",
      nextClientIn: "через",
      minutesShort: "мин",
      noNextClient: "Сегодня записей больше нет",
    },
    kpi: {
      todayRevenue: "Выручка сегодня",
      // QA-112: was a hardcoded "vs прошлая суббота" — a comparison that is
      // never computed (KPI tiles carry no trend deltas yet). Honest
      // descriptive sublabel instead of a false/misleading comparison.
      todayRevenueSub: "По записям на сегодня",
      todayBookings: "Записей сегодня",
      todayBookingsSub: "загрузка дня",
      todayBookingsValueTemplate: "{count} из {capacity}ч",
      weekRevenue: "Выручка за неделю",
      weekRevenueSub: "к прошлой неделе",
      newClients: "Новые клиенты",
      newClientsValueTemplate: "{count} за 7д",
      returningClientsTemplate: "повторных: {count}",
    },
    bookings: {
      title: "Ближайшие записи",
      subtitleTemplate: "Сегодня · ещё {count} {plural}",
      seeAll: "Все записи",
      emptyTitle: "На сегодня записей нет",
      emptyDescription: "Можно поправить расписание или добавить запись вручную.",
      pendingBadge: "Ожидает",
      confirmAction: "Подтвердить",
      declineAction: "Отклонить",
      chatAction: "Открыть чат",
      moreAction: "Действия",
      rescheduleAction: "Перенести",
      cancelAction: "Отменить",
      cancelConfirmTitle: "Отменить запись?",
      cancelConfirmMessage:
        "Клиент получит уведомление об отмене. Вернуть запись не получится.",
      cancelConfirmCta: "Отменить запись",
      cancelFailed: "Не удалось отменить запись. Попробуйте ещё раз.",
      // MASTER-DASHBOARD-FIX-A #3: tooltips for disabled actions
      // whose time window has passed. Backend rejects with 409
      // "less than 60 minutes before start" — UI surfaces the same
      // rule preemptively via tooltip on the disabled button.
      modifyWindowExpiredTooltip:
        "Перенести или отменить можно не позже чем за час до начала.",
      confirmWindowExpiredTooltip:
        "Время записи уже наступило — подтверждать уже поздно.",
    },
    attention: {
      title: "Требуют внимания",
      subtitleTemplate: "{count} {plural}",
      sortLabel: "Сортировка: важность",
      emptyTitle: "Всё под контролем",
      emptyDescription:
        "Нет срочных задач. Можно сосредоточиться на работе с клиентами.",
      confirmBookingTitle: "Подтвердить запись",
      // RESCHEDULE-CURRENT-TIME: запрос переноса — отдельная задача, время
      // в описании «прежнее → запрошенное».
      rescheduleRequestTitle: "Подтвердить перенос",
      confirmBookingCta: "Подтвердить",
      confirmBookingBusy: "Подтверждаем…",
      unansweredReviewTitle: "Ответить на отзыв",
      unansweredReviewCta: "Ответить",
      freeSlotTitle: "Свободное окошко {from}–{to}",
      // FIX-FREE-HOURS: раньше здесь стояли минуты («435 мин сегодня
      // пустуют») — величина, которую мастер всё равно переводит в часы в
      // уме, причём тем дольше, чем крупнее окошко. Часы округляются ВНИЗ:
      // окошко всегда >= 60 мин (см. `findFirstFreeSlotToday`), поэтому
      // значение никогда не ноль, и округление вниз не обещает больше, чем
      // есть. Точные границы окошка остаются в заголовке карточки.
      freeSlotDescription: (hours: number) =>
        `Сегодня пустует ${hours} ${pluralize(hours, "час", "часа", "часов")}. Настройте автоматические скидки.`,
      freeSlotCta: "Настроить горящие окошки",
    },
    quickActions: {
      title: "Быстрые действия",
      subtitle: "В одно касание",
      addBooking: "Добавить запись",
      addBookingSub: "Вручную в расписание",
      blockTime: "Закрыть время",
      blockTimeSub: "Перерыв или выходной",
      sharePublic: "Поделиться профилем",
      sharePublicSub: "Ссылка для соцсетей",
      invitePeople: "Пригласить клиента",
      invitePeopleSub: "По телефону или ссылке",
      addPortfolio: "Добавить в портфолио",
      addPortfolioSub: "Свежая работа",
    },
    announcements: {
      title: "Анонсы и советы",
      from: "от МастерРядом",
    },
    manualBooking: {
      title: "Новая запись",
      chooseService: "Выберите услугу",
      // FIX-NAME-HINT: формат несёт сам плейсхолдер — у поля нет отдельной
      // подписи, подсказка `common.clientNameHint` стоит под ним.
      clientNamePlaceholder: "Фамилия и имя клиента",
      phonePlaceholder: "Телефон",
      commentPlaceholder: "Комментарий",
      cancel: "Отмена",
      create: "Создать запись",
      saving: "Сохраняем…",
      // STUDIO-MASTER-OWN-BOOKINGS-01: вручную записывают на СВОИ услуги.
      notSoloHint: "Сначала добавьте свои услуги — вручную записывают на ваши собственные услуги.",
      createError: "Не удалось создать запись. Попробуйте ещё раз.",
    },
    bookingActions: {
      confirmError: "Не удалось подтвердить запись. Попробуйте ещё раз.",
      declineError: "Не удалось отклонить запись. Попробуйте ещё раз.",
      declineReasonPrompt:
        "Укажите причину отказа — она будет отправлена клиенту:",
      declineTitle: "Отклонить запись",
      declineLabel: "Причина отказа",
      declinePlaceholder: "Например: «Конфликт по времени»",
      declineConfirmLabel: "Отклонить",
    },
  },
  /**
   * Title / subtitle copy for each master cabinet page. Currently only
   * `home` is consumed (by the dashboard's `<MasterPageHeader>`); the
   * rest are reserved for the follow-up commits that migrate the
   * remaining pages (Schedule, Analytics, Model-offers, Billing,
   * Bookings, Notifications) to the new per-page header pattern. Don't
   * delete as "unused" — they're future surfaces.
   */
  pageTitles: {
    // PWA-UX-BATCH-01: подзаголовка у «Главной» больше нет — на телефоне
    // шапка отнимала экран, а строка ничего не сообщала.
    home: { title: "Главная" },
    bookings: { title: "Записи", subtitle: "Ждут подтверждения и уже подтверждённые" },
    notifications: { title: "Уведомления", subtitle: "Всё по работе с клиентами" },
    schedule: { title: "Расписание", subtitle: "Свободные окошки и план дня" },
    scheduleSettings: { title: "Настройки расписания", subtitle: "Часы работы, перерывы, особые дни" },
    clients: { title: "Клиенты", subtitle: "Ваши клиенты и история визитов" },
    reviews: { title: "Отзывы", subtitle: "Оценки и обратная связь от клиентов" },
    analytics: { title: "Аналитика", subtitle: "Динамика выручки и поведение клиентов" },
    profile: { title: "Мой профиль", subtitle: "Имя, услуги, портфолио и публичная страница" },
    accountSettings: { title: "Настройки аккаунта", subtitle: "Безопасность, уведомления, подписка" },
    modelOffers: { title: "Модели", subtitle: "Поиск моделей на бесплатные процедуры" },
    billing: { title: "Подписка", subtitle: "Ваш тариф и платежи" },
    fallback: { title: "Кабинет мастера", subtitle: "" },
  },
} as const;
