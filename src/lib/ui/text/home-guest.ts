export const homeGuest = {
  eyebrow: "Мастера красоты рядом",
  // FIX-EXP-CONTENT-GRAMMAR (EXP-008): stat counts all published providers
  // (masters + studios) — truthful term is «специалистов», not «мастеров».
  eyebrowMastersSuffix: "мастеров",
  heroTitle: "Запишитесь к лучшим",
  heroTitleAccent: "мастерам",
  heroTitleAfter: "красоты — без звонков и переписок",
  heroSubtitle:
    "Маникюр, стрижка, брови, массаж — выберите услугу, удобное время и мастера в вашем районе",
  searchPlaceholder: "Какая услуга?",
  searchCta: "Найти мастера",
  statsBookings: "завершённых записей",
  howItWorks: {
    title: "Как это",
    titleAccent: "работает",
    subtitle: "Запись за 30 секунд — без звонков и переписки",
    step1Title: "Найдите",
    step1Text: "Выберите услугу и удобное время",
    step2Title: "Запишитесь",
    step2Text: "За 30 секунд, без звонков",
    step3Title: "Получите",
    // FIX-EXTERNAL-GATING-01 (G-1): provider-neutral marketing copy — don't
    // advertise a specific (currently killed) delivery channel on the guest home.
    step3Text: "Напоминания перед визитом, отзывы после",
  },
  topMasters: {
    title: "Топ мастеров",
    titleAccent: "этого месяца",
    subtitle: "По количеству записей и оценкам клиентов",
    seeAll: "Смотреть всех мастеров",
  },
  becomeMaster: {
    title: "Вы мастер красоты?",
    subtitle: "Получайте клиентов без рекламы. Бесплатно для соло-мастеров",
    cta: "Стать мастером",
    ctaSecondary: "Узнать больше",
  },
  faq: {
    title: "Частые",
    titleAccent: "вопросы",
    seeAll: "Все вопросы",
    // TODO: вынести в CMS/AppSetting когда понадобится правка без деплоя
    items: [
      {
        q: "Сколько стоит запись через МастерРядом?",
        a: "Запись бесплатна. Вы платите только за услугу мастеру по его прайсу.",
      },
      {
        q: "Можно ли отменить или перенести запись?",
        a: "Да, в личном кабинете до 2 часов до начала. Мастер получит уведомление автоматически.",
      },
      {
        q: "Как я узнаю что запись подтверждена?",
        // FIX-EXTERNAL-GATING-01 (G-1): provider-neutral (was "в Telegram").
        a: "Уведомление придёт сразу после подтверждения мастером, плюс напоминание за 24 часа и за 2 часа до визита.",
      },
      {
        q: "Что если мастер опаздывает или не вышел?",
        a: "Напишите в чат записи — мастер ответит. Если не выходит на связь — обратитесь в поддержку, мы вернём предоплату.",
      },
    ],
  },
} as const;
