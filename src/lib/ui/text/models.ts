export const models = {
  hero: { eyebrow: "Для моделей" },
  compactHero: { learnMore: "Что такое модель?" },
  howItWorks: { eyebrow: "Как это работает", title: "Взаимный обмен — в чём суть" },
  expectations: { eyebrow: "Прежде чем откликнуться" },
  list: {
    titleWithCity: "Предложения в городе {city}",
    titleAllCities: "Все предложения",
    countLabelOne: "{count} предложение",
    countLabelFew: "{count} предложения",
    countLabelMany: "{count} предложений",
    categoryAll: "Все услуги",
  },
  card: {
    durationServiceLabel: "Услуга",
    durationContentLabel: "Контент и фото",
    durationTotalLabel: "Всего времени",
    dateLabel: "Дата",
    priceFreeForModel: "Бесплатно для модели",
    reviewsLabel: "отзывов",
    detailsCta: "Подробнее",
  },
  empty: {
    titleWithCity: "Пока нет предложений в {city}",
    titleNoCity: "Пока нет активных предложений",
    description:
      "Мастера регулярно публикуют новые предложения — особенно в выходные и перед сезоном съёмок. Загляните позже или попробуйте другой город.",
    changeCityHint: "Сменить город можно в шапке сайта",
    fallbackPrompt: "Ищете обычного мастера, не для практики?",
    fallbackLink: "Перейти в каталог",
  },
  forMasters: {
    title: "Вы мастер?",
    description:
      "Опубликуйте предложение для модели — клиенты подадут заявку, вы выберете подходящего и согласуете время. Без переписок в директе.",
    cta: "Опубликовать предложение",
  },
} as const;
