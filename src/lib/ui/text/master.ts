export const master = {
  topbar: {
    nav: {
      home: "Главная",
      bookings: "Записи",
      schedule: "Расписание",
      models: "Модели",
      profile: "Профиль",
      more: "Ещё",
    },
  },
  bookingsPage: {
    moreDrawerTitle: "Ещё",
    menuClients: "Клиенты",
    menuReviews: "Отзывы",
    menuAnalytics: "Аналитика",
    menuSettings: "Настройки",
    menuMyPage: "Моя страница →",
    menuModels: "Модели",
    menuBilling: "Тариф",
  },
  advisor: {
    aiInsightTitle: "Совет от ИИ",
  },
  profile: {
    errors: {
      updateSettings: "Не удалось обновить настройки. Попробуйте ещё раз.",
      portfolioLimitReached: "В портфолио больше нет места. Удалите фото или перейдите на тариф выше.",
      leaveStudio: "Не удалось покинуть студию. Попробуйте ещё раз.",
      saveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    },
    portfolio: {
      dropTitle: "Перетащите фото сюда",
      dropSubtitle: "или нажмите, чтобы выбрать фото",
      pickTitle: "Выбрать фото",
      uploadingSuffix: "— загружаем…",
    },
    leaveStudio: {
      bannerTitle: "Вы работаете в составе студии",
      bannerDescription:
        "Если нужно прекратить членство, вы можете самостоятельно выйти из студии. После выхода доступ к студийным разделам и настройкам студии будет отключён.",
      bannerAction: "Выйти из студии",
      modalTitle: "Покинуть студию?",
      modalDescription:
        "После выхода вы станете независимым мастером. Будущие записи в студии перед выходом нужно перенести на другого мастера или отменить.",
      transferServicesLabel: "Перенести услуги студии в мой прайс",
      transferServicesHint: "Цены и длительность будут скопированы с вашими настройками",
      leaveAction: "Покинуть студию",
      // 29.09 доработки · 04: карточка в «Настройках аккаунта».
      teamTemplate: "Команда «{name}»",
      blockingNotice: (count: number) =>
        `Будущих записей в студии: ${count}. Попросите администратора студии перенести их на другого мастера или отменить — после этого можно выйти.`,
      openBookings: "Открыть записи",
    },
  },
} as const;
