export const legal = {
  lastUpdated: "Последнее обновление:",
  // RKN-FIX-01: documents are versioned (src/lib/legal/documents.ts) and the
  // version is what lands in UserConsent.documentVersion — so the page has to
  // show which version the reader is looking at.
  versionLabel: "Версия",
  // Consent form (login). Each row is ONE purpose with ONE document — the
  // 152-ФЗ ст. 9 (ред. 156-ФЗ) requirement that killed the merged checkbox.
  consent: {
    termsPrefix: "Я принимаю",
    termsLink: "Пользовательское соглашение",
    pdPrefix: "Я даю",
    pdLink: "согласие на обработку персональных данных",
    pdMiddle: "и ознакомлен(а) с",
    privacyLink: "Политикой конфиденциальности",
    marketingLabel: "Хочу получать новости, персональные подборки и акции",
    requiredMark: "обязательно",
    optionalMark: "необязательно",
    groupLabel: "Согласия",
  },
  // RKN-FIX-18 — отзыв согласия из настроек. Отзывается ТОЛЬКО маркетинг:
  // отзыв согласия на обработку ПДн — это по сути требование удалить
  // аккаунт, и притворяться, что это тумблер, нельзя.
  withdrawal: {
    title: "Маркетинговые сообщения",
    description:
      "Новости, персональные подборки и акции. Согласие можно отозвать в любой момент — на подтверждения записей, напоминания и сообщения от мастера это не влияет.",
    toggleLabel: "Получать маркетинговые сообщения",
    activeSince: "Согласие дано",
    revoked: "Согласие отозвано",
    // Граница скоупа, честно объяснённая пользователю.
    pdNoticeTitle: "Обработка персональных данных и оферта",
    pdNoticeBody:
      "Эти согласия нельзя отозвать переключателем: без них аккаунт не может существовать. Если вы хотите прекратить обработку своих данных — удалите аккаунт; по остальным вопросам напишите в поддержку.",
    pdNoticeDeleteCta: "Удалить аккаунт",
    pdNoticeSupportCta: "Написать в поддержку",
    error: "Не удалось изменить согласие. Попробуйте ещё раз.",
  },
  toc: {
    heading: "На этой странице",
    label: "Содержание документа",
  },
  draft: {
    title: "Черновик",
    description:
      "Документ ещё проверяют юристы. Пока здесь черновик, который описывает, как платформа работает на самом деле.",
  },
  contacts: {
    legal: "legal@masterryadom.ru",
    privacy: "privacy@masterryadom.ru",
    support: "support@masterryadom.ru",
  },
  requisites: {
    entityType: "Индивидуальный предприниматель",
    entityName: "Дмитриев Артем Романович",
    innLabel: "ИНН",
    ogrnLabel: "ОГРНИП",
    addressLabel: "Адрес регистрации",
    emailLabel: "Email для обращений",
    placeholder: {
      inn: "[ИНН]",
      ogrn: "[ОГРНИП]",
      address: "[Юридический адрес]",
    },
  },
} as const;
