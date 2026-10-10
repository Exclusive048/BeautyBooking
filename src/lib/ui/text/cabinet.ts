export const cabinet = {
  // VISIBILITY-CATALOG-STATUS: есть ли кабинет в каталоге и чего не хватает.
  catalogPresence: {
    listedMaster: "Вы в каталоге — клиенты находят вас в поиске.",
    listedStudio: "Студия в каталоге — клиенты находят её в поиске.",
    notListedPrefix: "Пока не в каталоге:",
    gapsMaster: {
      hidden: "включите видимость",
      address: "укажите адрес с городом",
      schedule: "настройте рабочие дни",
    },
    gapsStudio: {
      hidden: "включите видимость",
      address: "укажите адрес с городом",
      schedule: "нужен хотя бы один мастер с рабочими днями",
    },
    statusListed: "В каталоге",
    statusHidden: "Скрыт из каталога",
    statusIncomplete: "Не в каталоге",
  },
  trial: {
    badgePrefix: "PREMIUM",
    bannerTitleTomorrow: "Пробный период заканчивается завтра",
    bannerTitleMultiDays: "Пробный период заканчивается через {countDays}",
    bannerDescription: "Оформите подписку, чтобы сохранить расширенные возможности",
    bannerCta: "Перейти к тарифам",
    bannerDismiss: "Закрыть",
  },
} as const;
