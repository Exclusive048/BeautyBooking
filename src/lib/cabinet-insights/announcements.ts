import { isLaunchPromoActive } from "@/lib/billing/launch-promo";
import * as UI_TEXT from "@/lib/ui/text";
import { cabinetHref } from "./links";
import type { CabinetLinkKey, CabinetScope } from "./types";

/**
 * AI-CABINET-ANALYSIS — «Новое в МастерРядом» на главной кабинета. Раньше блок
 * на главной мастера показывал три выдуманных сообщения-заглушки; теперь это
 * список того, что действительно появилось в продукте, с датой и ссылкой на
 * раздел, где этим пользоваться.
 *
 * Новая запись — сверху списка, с датой выпуска (ключ салона не нужен: дата
 * объявления, а не визита). Акция стоит первой, пока идёт, и пропадает сама
 * после `LAUNCH_PROMO_ENDS_AT`. Блок показывает первые `limit`.
 */

const T = UI_TEXT.cabinetHome.announcements.items;

type AnnouncementId = keyof typeof T;

/** «#ai-analysis» — карточка разбора на той же главной. */
type AnnouncementLink = CabinetLinkKey | "aiAnalysis" | { master: CabinetLinkKey; studio: CabinetLinkKey };

type Entry = {
  id: AnnouncementId;
  /** Дата выпуска, `YYYY-MM-DD`. */
  publishedOn: string;
  scopes: readonly CabinetScope[];
  link: AnnouncementLink;
  pinned?: boolean;
};

const BOTH: readonly CabinetScope[] = ["master", "studio"];

const ENTRIES: readonly Entry[] = [
  { id: "aiAnalysis", publishedOn: "2026-11-01", scopes: BOTH, link: "aiAnalysis" },
  { id: "bookingsJournal", publishedOn: "2026-10-31", scopes: BOTH, link: "bookings" },
  { id: "studioChat", publishedOn: "2026-10-31", scopes: ["studio"], link: "messages" },
  { id: "freeWindows", publishedOn: "2026-10-30", scopes: BOTH, link: "freeWindows" },
  { id: "packedSlots", publishedOn: "2026-10-30", scopes: BOTH, link: "freeWindows" },
  { id: "betaPromo", publishedOn: "2026-10-29", scopes: BOTH, link: "billing", pinned: true },
  { id: "manyBreaks", publishedOn: "2026-10-29", scopes: BOTH, link: { master: "schedule", studio: "teamSchedule" } },
  { id: "socialTelegramMax", publishedOn: "2026-10-12", scopes: BOTH, link: "profile" },
];

export const CABINET_ANNOUNCEMENTS_LIMIT = 3;

export type CabinetAnnouncement = {
  id: AnnouncementId;
  title: string;
  text: string;
  publishedOn: string;
  action: { label: string; href: string } | null;
};

function resolveHref(scope: CabinetScope, link: AnnouncementLink): string | null {
  if (link === "aiAnalysis") return "#ai-analysis";
  if (typeof link === "object") return cabinetHref(scope, link[scope]);
  return cabinetHref(scope, link);
}

export function listCabinetAnnouncements(input: {
  scope: CabinetScope;
  /** Разбор показывается на главной — без него о нём не объявляем. */
  aiAnalysisAvailable: boolean;
  now?: Date;
  limit?: number;
}): CabinetAnnouncement[] {
  const now = input.now ?? new Date();
  const promoActive = isLaunchPromoActive(now);
  const visible = ENTRIES.filter((entry) => {
    if (!entry.scopes.includes(input.scope)) return false;
    if (entry.id === "betaPromo" && !promoActive) return false;
    if (entry.id === "aiAnalysis" && !input.aiAnalysisAvailable) return false;
    return true;
  });
  const ordered = [
    ...visible.filter((entry) => entry.pinned),
    ...visible.filter((entry) => !entry.pinned).sort((a, b) => b.publishedOn.localeCompare(a.publishedOn)),
  ];
  return ordered.slice(0, input.limit ?? CABINET_ANNOUNCEMENTS_LIMIT).map((entry) => {
    const href = resolveHref(input.scope, entry.link);
    return {
      id: entry.id,
      title: T[entry.id].title,
      text: T[entry.id].text,
      publishedOn: entry.publishedOn,
      action: href ? { label: T[entry.id].action, href } : null,
    };
  });
}
