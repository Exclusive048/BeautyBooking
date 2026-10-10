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
    bannerFocusTitle: "Главное на обложке",
  },
} as const;
