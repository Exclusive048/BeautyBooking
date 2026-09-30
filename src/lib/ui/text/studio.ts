export const studio = {
  profile: {
    subtitle: "Управление студией",
    publicationLabel: "Виден в каталоге",
    coverUpload: "Загрузить обложку",
    editCover: "Изменить",
    nameFallback: "Название студии",
  },
  profileForm: {
    nameLabel: "Название",
    namePlaceholder: "Название студии",
    // FIX-STUDIO-SETTINGS-MERGE: слоган переехал сюда из удалённой вкладки
    // «Общее» — он часть публичной карточки, а не отдельного раздела.
    taglineLabel: "Краткий слоган",
    taglinePlaceholder: "Одной строкой — чем вы хороши",
    descriptionLabel: "Описание",
    descriptionPlaceholder:
      "Расскажите о студии — атмосфера, специализация, команда",
    addressLabel: "Адрес",
    addressPlaceholder: "Начните вводить адрес…",
    // FIX-STUDIO-TZ-FROM-ADDRESS: пояс больше не выбирают руками — он
    // выводится из города адреса при сохранении. Показываем результат, чтобы
    // изменение было наблюдаемым, а не молчаливым.
    timezoneLabel: "Часовой пояс",
    timezoneHint:
      "Определяется по адресу. В нём считаются записи, расписание и напоминания.",
    timezoneUnknown: "Появится после сохранения адреса",
    selectAddressAria: "Выбрать адрес {address}",
    phoneLabel: "Телефон",
    phonePlaceholder: "+7 900 000 00 00",
    emailLabel: "Email",
    emailPlaceholder: "studio@email.com",
    vkLabel: "VK",
    vkPlaceholder: "vk.ru/studio",
    instagramLabel: "Instagram",
    instagramPlaceholder: "https://instagram.com/username",
  },
  profilePage: {
    loading: "Загружаем профиль студии…",
    loadFailed: "Не удалось загрузить профиль студии. Попробуйте ещё раз.",
    saveFailed: "Не удалось сохранить профиль студии. Попробуйте ещё раз.",
    uploadBannerFailed: "Не удалось загрузить обложку. Попробуйте ещё раз.",
    deadlineValidation: "Укажите от 0 до 168 часов.",
    deleteFailed: "Не удалось удалить кабинет студии. Попробуйте ещё раз.",
    bannerFocusTitle: "Главное на обложке",
  },
  settingsPanel: {
    settingsSubtitle: "Правила записи, уведомления и горящие окошки для всей студии.",
    hotSlotsTitle: "Горящие окошки",
    hotSlotsDescription:
      "Автоскидки на свободные окошки по правилам студии.",
    cancellationTitle: "Политика отмены",
    cancellationHint:
      "Клиент может отменить запись не позднее указанного срока. Оставьте поле пустым — отменять можно в любой момент; 0 — отмена запрещена.",
    cancellationPlaceholder: "Например, 24",
    currentValueLabel: "Сейчас: ",
    noLimit: "Без ограничений",
    hoursValue: (hours: number) => `${hours} ч.`,
    remindersTitle: "Напоминания",
    remindersHint: "Напоминания о записи за 24 часа и 2 часа до начала.",
    remindersOn: "Включено",
    remindersOff: "Выключено",
  },
  masterDrawer: {
    titleFallback: "Мастер",
    close: "Закрыть",
    tabs: {
      skills: "Услуги",
      profile: "Профиль",
    },
    loading: "Загружаем…",
    errors: {
      loadMaster: "Не удалось загрузить мастера. Попробуйте ещё раз.",
      saveServices: "Не удалось сохранить услуги. Попробуйте ещё раз.",
      saveProfile: "Не удалось сохранить профиль. Попробуйте ещё раз.",
    },
    skills: {
      searchPlaceholder: "Поиск услуги",
      activeLabel: "Активна",
      pricePlaceholder: "Стоимость",
      durationPlaceholder: "Длительность",
      save: "Сохранить",
      saving: "Сохраняем…",
    },
    profile: {
      title: "Профиль мастера",
      namePlaceholder: "Имя",
      statusPlaceholder: "О себе одной строкой",
      activeLabel: "Работает",
      save: "Сохранить",
      saving: "Сохраняем…",
    },
  },
  tabs: {
    notifications: "Уведомления",
    features: "Функции",
    settings: "Настройки",
  },
  danger: {
    title: "Удаление студии",
    hint: "Все данные, мастера и история записей будут удалены безвозвратно.",
    cta: "Удалить студию",
  },
} as const;
