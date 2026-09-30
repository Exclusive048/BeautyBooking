export const footer = {
  aria: {
    nav: "Навигация футера",
  },
  cta: {
    title: "Вы мастер красоты?",
    subtitle: "Начните принимать клиентов онлайн уже сегодня",
    subtitleAccent: "Бесплатно",
    button: "Создать профиль бесплатно",
    hint: "Настройте кабинет так, как удобно вам",
  },
  // FOOTER-HONEST-METRICS (2026-09-15): выдуманные числа («+34% записей»,
  // «1 240 предложений», «−54%», «−40…−70%», «3 месяца без комиссии») сняты
  // по решению владельца. У мастеров метрик нет; у моделей — живые
  // (`getPublicModelOfferStats`), здесь только подписи к ним.
  ctaMasters: {
    badge: "Для мастеров",
    title: "Принимаете клиентов? Платформа уже всё умеет",
    subtitle:
      "Расписание, онлайн-запись, отзывы и аналитика — в одном кабинете. Начать можно бесплатно.",
    cta: "Стать мастером",
  },
  ctaModels: {
    badge: "Для моделей",
    title: "Хотите модный образ со скидкой?",
    subtitle:
      "Мастера ищут моделей для отработки техник и портфолио — услуги со скидкой, всё официально и безопасно.",
    metricOffersLabel: "открыто сейчас",
    metricDiscountLabel: "средняя скидка",
    cta: "Найти предложение",
  },
  columns: {
    about: "О платформе",
    clients: "Для клиентов",
    masters: "Для мастеров",
    support: "Поддержка",
  },
  links: {
    about: "О нас",
    howItWorks: "Как это работает",
    partners: "Партнёрам",
    careers: "Вакансии",
    howToBook: "Как записаться",
    popularServices: "Популярные услуги",
    mastersNearby: "Мастера рядом",
    offersForModels: "Предложения для моделей",
    becomeMaster: "Стать мастером",
    pricing: "Тарифы",
    knowledgeBase: "База знаний",
    affiliateProgram: "Партнёрская программа",
    faq: "FAQ",
    contact: "Написать нам",
    terms: "Пользовательское соглашение",
    privacy: "Политика конфиденциальности",
  },
  brandDescription:
    "Маркетплейс мастеров красоты. Находите лучших мастеров рядом и записывайтесь онлайн без звонков.",
  legal: {
    copyright: "© {year} МастерРядом",
    // The ИНН is filled from `NEXT_PUBLIC_LEGAL_INN` (FooterCopyright).
    // FIX-VISUAL-POLISH I8: when it's unset (or the old fake "1234567890"),
    // the footer shows the legal entity WITHOUT the ИНН clause
    // (`entityWithoutInn`) — a graceful degrade, never the literal
    // «[не указан]». Set the real requisites before launch.
    entityTemplate: "Дмитриев Артем Романович, ИНН {inn}",
    entityWithoutInn: "Дмитриев Артем Романович",
    innUnset: "[не указан]",
  },
  socials: {
    vk: "VK",
    telegram: "Telegram",
  },
} as const;
