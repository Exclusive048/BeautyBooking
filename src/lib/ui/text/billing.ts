export const billing = {
  // Страница подписки (29.09 доработки · 11 — строки перенесены из кода).
  page: {
    loadFailed: "Не удалось загрузить тарифы. Попробуйте ещё раз.",
    checkoutFailed: "Не удалось создать оплату. Попробуйте ещё раз.",
  },
  featureGate: {
    ctaLabel: "Посмотреть тарифы",
    loading: "Загружаем…",
    title: "Только для тарифа {plan}",
    description: "Перейдите на {plan}, чтобы разблокировать эту функцию.",
    notificationsTitle: "Уведомления в Telegram и ВКонтакте — тариф PRO",
    notificationsHint: "Подключите Telegram или ВКонтакте, чтобы не пропустить ни одной записи",
    cta: "Перейти на PRO",
    // FIX-27 — unified locked-state card. {plan} is the required tier derived
    // from the live plan-config (findMinPlanName over /api/billing/plans),
    // never a hardcoded string (closes PLAN-GATE-HINT-DIVERGENCE).
    tierBadge: "Доступно на тарифе {plan}",
    upgradeCta: "Перейти на {plan}",
    telegramLocked: "Уведомления в Telegram доступны на платном тарифе.",
    vkLocked: "Уведомления во ВКонтакте доступны на платном тарифе.",
  },
  period: {
    month: "1 месяц",
    months3: "3 месяца",
    months6: "6 месяцев",
    year: "12 месяцев",
    yearSavings: (amount: number) => `Экономия ${amount}₽ в год`,
    yearDiscount: "−20%",
    savingsBadge: (pct: number) => `−${pct}%`,
    perMonth: "/мес",
  },
  // LAUNCH-PROMO-01: баннер кабинетной страницы подписки до 1 ноября.
  launchPromo: {
    title: "До 1 ноября все тарифы бесплатны",
    body: "У вашего кабинета сейчас максимальный тариф PREMIUM — без оплаты. После 1 ноября кабинет перейдёт на FREE, если вы не выберете платный тариф. Все данные сохранятся.",
    planCta: "Бесплатно до 1 ноября",
  },
  autoRenew: {
    label: "Автопродление",
    enabled: "Включено",
    disabled: "Отключено",
    enableFailed: "Не удалось включить автопродление. Попробуйте ещё раз.",
    disableFailed: "Не удалось отменить автопродление. Попробуйте ещё раз.",
    notAvailableForFree: "Недоступно для бесплатного тарифа",
  },
  // BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2): opt-in renewal on a price increase.
  // Copy shared by the renewal cron notifications and the cabinet banner.
  // `{priceLabel}` / `{deadlineLabel}` are pre-formatted (₽ + RU date) by callers.
  priceOptIn: {
    startedTitle: "Цена подписки изменилась",
    startedBody: (priceLabel: string, deadlineLabel: string) =>
      `Стоимость вашего тарифа выросла до ${priceLabel}. Продлите по новой цене до ${deadlineLabel}, иначе подписка приостановится.`,
    reminderTitle: "Продлите подписку по новой цене",
    reminderBody: (priceLabel: string, deadlineLabel: string) =>
      `Новая стоимость тарифа — ${priceLabel}. Примите новую цену до ${deadlineLabel}, чтобы сохранить подписку.`,
    lapsedTitle: "Подписка приостановлена",
    lapsedBody:
      "Вы не подтвердили новую цену в срок, и подписка приостановлена — оформить её заново можно в любой момент.",
    bannerTitle: "Цена тарифа выросла",
    bannerBody: (priceLabel: string, deadlineLabel: string) =>
      `Новая стоимость — ${priceLabel}. Продлите по новой цене до ${deadlineLabel}, чтобы сохранить доступ.`,
    acceptCta: "Принять новую цену",
    acceptFailed: "Не удалось продлить подписку. Попробуйте ещё раз.",
  },
  currentFeatures: {
    sectionTitle: (planName: string) => `Что включено в тариф «${planName}»`,
    included: "Включено",
    notIncluded: "Недоступно",
    upgradeHint: "Доступно на более высоком тарифе",
    unlimitedValue: "Без ограничений",
    limitValue: (n: number) => `до ${n}`,
    upgradeCta: "Сменить тариф",
  },
  paywall: {
    title: "Доступно на тарифе PRO",
    description: (feature: string) => `Чтобы использовать «${feature}», перейдите на тариф PRO или выше.`,
    // UI-21: подстановка на случай, когда вызывающий не назвал функцию. Жила
    // хардкодом в самом компоненте — то есть единственный источник текстов
    // знал шаблон, но не знал слово, которое в него подставляется.
    defaultFeature: "эту функцию",
    cta: "Перейти на PRO",
    lockedTooltip: "Доступно с тарифа PRO",
    activeCount: (active: number, total: number) => `${active} из ${total} активно`,
    soonBadge: "Скоро",
  },
  featuresPage: {
    title: "Функции",
    subtitle: "Управляйте функциями вашего тарифа.",
    planBadge: (plan: string) => `Ваш тариф: ${plan}`,
    allUnlocked: "Все функции разблокированы",
    lockedSection: (plan: string) => `Доступно в тарифе ${plan}`,
    upgradeCta: "Улучшить тариф",
  },
  publicPage: {
    title: "Публичная страница",
    subtitle: "Настройте публичную ссылку и поделитесь профилем.",
    usernameLabel: "Публичный адрес",
    usernameHint: "Только латинские буквы, цифры и дефис. Мин. 3 символа.",
    urlPreview: (username: string) => `masterryadom.ru/u/${username}`,
    copyLink: "Скопировать ссылку",
    copied: "Скопировано",
    qrTitle: "QR-код профиля",
    qrHint: "Разместите QR-код на визитке или в салоне.",
    downloadQr: "Скачать QR",
    downloadCard: "Скачать визитку",
    downloadCardSocial: "Для соцсетей",
    cardSectionTitle: "Визитка",
    cardSectionHint: "Скачайте визитку с QR-кодом для публикации или печати.",
    cardPreviewAlt: "Так выглядит визитка",
    cardGenerating: "Готовим визитку…",
    saveUsername: "Сохранить",
    saving: "Сохраняем…",
    saveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    saved: "Сохранено",
    openProfile: "Открыть профиль",
  },
} as const;
