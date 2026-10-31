import type { CabinetLinkKey, CabinetScope } from "./types";

/**
 * AI-CABINET-ANALYSIS — куда ведут советы и пункты ИИ-разбора. Модель ссылок не
 * пишет: она называет раздел ключом, а адрес берётся только отсюда, поэтому
 * разбор не может увести ни на чужую страницу, ни на несуществующий раздел.
 * `null` — у этого кабинета такого раздела нет.
 */
const MASTER_LINKS: Record<CabinetLinkKey, string | null> = {
  profile: "/cabinet/master/profile",
  services: "/cabinet/master/services",
  schedule: "/cabinet/master/schedule/settings",
  rules: "/cabinet/master/schedule/settings?tab=rules",
  visibility: "/cabinet/master/schedule/settings?tab=visibility",
  freeWindows: "/cabinet/master/schedule",
  portfolio: "/cabinet/master/portfolio",
  bookings: "/cabinet/master/bookings",
  clients: "/cabinet/master/clients",
  reviews: "/cabinet/master/reviews",
  messages: "/cabinet/master/messages",
  analytics: "/cabinet/master/analytics",
  billing: "/cabinet/master/billing",
  hotSlots: "/cabinet/master/schedule/settings?tab=rules",
  team: null,
  teamSchedule: null,
  inviteMaster: null,
};

const STUDIO_LINKS: Record<CabinetLinkKey, string | null> = {
  profile: "/cabinet/studio/settings?section=profile",
  services: "/cabinet/studio/services",
  schedule: "/cabinet/studio/schedule/team",
  rules: "/cabinet/studio/settings?section=policy",
  visibility: "/cabinet/studio/settings?section=policy",
  freeWindows: "/cabinet/studio/calendar",
  portfolio: "/cabinet/studio/settings?section=portfolio",
  bookings: "/cabinet/studio/bookings",
  clients: "/cabinet/studio/clients",
  reviews: "/cabinet/studio/reviews",
  messages: "/cabinet/studio/messages",
  analytics: "/cabinet/studio/analytics",
  billing: "/cabinet/studio/billing",
  hotSlots: null,
  team: "/cabinet/studio/team",
  teamSchedule: "/cabinet/studio/schedule/team",
  inviteMaster: "/cabinet/studio/team/add",
};

export const CABINET_LINK_KEYS = Object.keys(MASTER_LINKS) as CabinetLinkKey[];

export function cabinetHref(scope: CabinetScope, key: CabinetLinkKey): string | null {
  return (scope === "master" ? MASTER_LINKS : STUDIO_LINKS)[key];
}

export function isCabinetLinkKey(value: unknown): value is CabinetLinkKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MASTER_LINKS, value);
}
