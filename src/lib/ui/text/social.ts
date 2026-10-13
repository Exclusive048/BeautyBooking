// FEAT-PROVIDER-SOCIALS: shared strings for the VK / Instagram / Telegram / MAX
// community-link inputs (studio + master cabinets), their live preview, and the
// public icons. `kinds` — по виду ссылки (`SocialKind`), в порядке показа.
export const social = {
  kinds: {
    vk: { label: "VK", placeholder: "vk.ru/studio или @studio", aria: "Сообщество ВКонтакте" },
    instagram: {
      label: "Instagram",
      placeholder: "instagram.com/studio или @studio",
      aria: "Страница в Instagram",
    },
    // SOCIAL-TG-MAX
    telegram: { label: "Telegram", placeholder: "t.me/studio или @studio", aria: "Канал в Telegram" },
    max: { label: "MAX", placeholder: "max.ru/studio или ссылка-приглашение", aria: "Канал в MAX" },
  },
  previewTemplate: "Ссылка: {label}",
  invalidTemplate: "Не распознали ссылку. Укажите адрес на {host}.",
  masterSectionTitle: "Соцсети",
  masterSectionSubtitle: "Ссылки на ваши сообщества и каналы — покажем в публичном профиле",
  editAria: "Изменить ссылку",
  notSet: "Не указано",
} as const;
