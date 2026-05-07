// Static announcements rendered in the right column of the master
// dashboard. These are platform-wide messages — when this list grows we'll
// move it into a CMS table, but three hand-curated entries don't justify
// the storage today.

export type AnnouncementType = "tip" | "announce" | "training";

export type AnnouncementItem = {
  id: string;
  type: AnnouncementType;
  label: string;
  title: string;
  description: string;
  href?: string;
};

export const ANNOUNCEMENTS: ReadonlyArray<AnnouncementItem> = [
  {
    id: "tip-portfolio",
    type: "tip",
    label: "СОВЕТ",
    title: "Добавьте 3 фото в портфолио",
    description: "Клиенты записываются на 2,4× чаще к мастерам с примерами работ.",
    href: "/cabinet/master/profile",
  },
  {
    id: "announce-whatsapp",
    type: "announce",
    label: "АНОНС",
    title: "Авто-напоминания клиентам по WhatsApp",
    description: "Включается в настройках. Бесплатно для Premium-аккаунтов.",
    href: "/cabinet/master/settings",
  },
  {
    id: "training-checks",
    type: "training",
    label: "ОБУЧЕНИЕ",
    title: "Вебинар: как поднять средний чек на 30%",
    description: "Чт 7 мая, 19:00. Бесплатно для мастеров платформы.",
  },
];
