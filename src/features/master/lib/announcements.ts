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
    // FIX-EXP-CONTENT-GRAMMAR (EXP-018): don't advertise a channel we don't
    // deliver. FIX-TELEGRAM-KILLSWITCH: Telegram is removed (legal) — reminders
    // go to clients via push + email (both live). SMS is a deploy-ops toggle.
    id: "announce-reminders",
    type: "announce",
    label: "АНОНС",
    title: "Напоминания клиентам на почту и на телефон",
    description: "Включается в настройках. Бесплатно на тарифе PREMIUM.",
    href: "/cabinet/master/account",
  },
  {
    // FIX-EXP-CONTENT-GRAMMAR (EXP-018): replaced a stale dated webinar
    // («Чт 7 мая, 19:00» — long past) with an evergreen, truthful tip about a
    // real feature (service packages). No date to go stale.
    id: "tip-packages",
    type: "tip",
    label: "СОВЕТ",
    title: "Соберите пакет услуг со скидкой",
    description: "Пакеты повышают средний чек — клиент записывается на несколько услуг сразу.",
  },
];
