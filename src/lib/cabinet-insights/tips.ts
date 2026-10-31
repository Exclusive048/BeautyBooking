import type { SetupStepId } from "@/lib/onboarding/setup-guide-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";
import { cabinetHref } from "./links";
import { MIN_SAMPLE } from "./booking-stats";
import { aheadLoad, type CabinetFacts, type CabinetLinkKey, type CabinetTip } from "./types";

/**
 * AI-CABINET-ANALYSIS — советы на главной кабинета. Правила, а не модель:
 * каждый совет срабатывает от конкретного факта кабинета (`facts.ts`) и ведёт
 * в раздел, где это правится.
 *
 * Что сюда НЕ входит намеренно:
 *  - то, что уже показывает «Требуют внимания» (неподтверждённые записи,
 *    отзывы без ответа, конец расписания) — второй раз то же самое не нужно;
 *  - то, на что сейчас ведут «Первые шаги»: пока шаг не пройден, совет о нём
 *    молчит (`openSetupSteps`), иначе на одной странице два указателя на одно.
 *
 * Порядок — по весу (что сильнее мешает записям, выше), показываются первые
 * `limit`. Пороги выбраны так, чтобы совет не срабатывал на двух-трёх записях:
 * доли считаются от `MIN_SAMPLE` и выше.
 */

const T = UI_TEXT.cabinetHome.tips;

export const CABINET_TIPS_LIMIT = 4;
const NAMES_SHOWN = 3;
/** Описание короче — «короткое». */
const SHORT_DESCRIPTION_CHARS = 120;

type Candidate = {
  id: string;
  weight: number;
  /** Шаг «Первых шагов», который ведёт туда же. */
  step?: SetupStepId;
  title: string;
  text: string;
  actionLabel: string;
  link: CabinetLinkKey;
};

function percent(value: number): number {
  return Math.round(value * 100);
}

function joinNames(names: string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).join(", ");
  const rest = names.length - NAMES_SHOWN;
  return rest > 0 ? `${shown} ${T.moreNames(rest)}` : shown;
}

function commonCandidates(facts: CabinetFacts): Candidate[] {
  const out: Candidate[] = [];
  const { bookings, rules, reviews, profile, services } = facts;
  const load = aheadLoad(facts.schedule);

  if (bookings.past >= 10 && bookings.cancelledByClient / bookings.past >= 0.15) {
    out.push({
      id: "client-cancellations",
      weight: 80,
      step: "rules",
      title: T.items.clientCancellations.title,
      text: T.items.clientCancellations.text(bookings.cancelledByClient, bookings.past),
      actionLabel: T.items.clientCancellations.action,
      link: "rules",
    });
  }

  if (bookings.past >= 10 && bookings.noShow >= 2 && bookings.noShow / bookings.past >= 0.05) {
    out.push({
      id: "no-shows",
      weight: 70,
      title: T.items.noShows.title,
      text: T.items.noShows.text(bookings.noShow),
      actionLabel: T.items.noShows.action,
      link: "clients",
    });
  }

  if (reviews.count >= MIN_SAMPLE && reviews.avg !== null && reviews.avg < 4.3) {
    out.push({
      id: "rating-low",
      weight: 75,
      title: T.items.ratingLow.title,
      text: T.items.ratingLow.text(UI_FMT.decimal(reviews.avg, 1)),
      actionLabel: T.items.ratingLow.action,
      link: "reviews",
    });
  }

  if (!rules.acceptNewClients) {
    out.push({
      id: "new-clients-closed",
      weight: 72,
      step: "rules",
      title: T.items.newClientsClosed.title,
      text: T.items.newClientsClosed.text,
      actionLabel: T.items.newClientsClosed.action,
      link: "visibility",
    });
  }

  if (bookings.past >= 10 && bookings.cancelledByProvider >= 3 && bookings.cancelledByProvider / bookings.past >= 0.1) {
    out.push({
      id: "provider-cancellations",
      weight: 55,
      title: T.items.providerCancellations.title,
      text: T.items.providerCancellations.text(bookings.cancelledByProvider),
      actionLabel: T.items.providerCancellations.action,
      link: facts.scope === "master" ? "schedule" : "teamSchedule",
    });
  }

  if (facts.schedule.workingDaysAhead >= 3 && load !== null && load < 0.2) {
    out.push({
      id: "load-low",
      weight: 60,
      title: T.items.loadLow.title,
      text: T.items.loadLow.text(percent(load)),
      actionLabel: T.items.loadLow.action,
      link: "freeWindows",
    });
  }

  if (rules.minBookingHoursAhead >= 12 && (load === null || load < 0.7)) {
    out.push({
      id: "min-hours-ahead-high",
      weight: 50,
      step: "rules",
      title: T.items.minHoursAheadHigh.title,
      text: T.items.minHoursAheadHigh.text(rules.minBookingHoursAhead),
      actionLabel: T.items.minHoursAheadHigh.action,
      link: "rules",
    });
  }

  if (rules.maxBookingDaysAhead < 14) {
    out.push({
      id: "max-days-ahead-short",
      weight: 40,
      step: "rules",
      title: T.items.maxDaysAheadShort.title,
      text: T.items.maxDaysAheadShort.text(rules.maxBookingDaysAhead),
      actionLabel: T.items.maxDaysAheadShort.action,
      link: "rules",
    });
  }

  if (profile.description === null) {
    out.push({
      id: "description-missing",
      weight: 52,
      step: "profile",
      title: T.items.descriptionMissing.title,
      text: T.items.descriptionMissing.text,
      actionLabel: T.items.descriptionMissing.action,
      link: "profile",
    });
  } else if (profile.description.length < SHORT_DESCRIPTION_CHARS) {
    out.push({
      id: "description-short",
      weight: 35,
      step: "profile",
      title: T.items.descriptionShort.title,
      text: T.items.descriptionShort.text,
      actionLabel: T.items.descriptionShort.action,
      link: "profile",
    });
  }

  if (facts.portfolioCount > 0 && facts.portfolioCount < 6) {
    out.push({
      id: "portfolio-thin",
      weight: 48,
      step: "portfolio",
      title: T.items.portfolioThin.title,
      text: T.items.portfolioThin.text(facts.portfolioCount),
      actionLabel: T.items.portfolioThin.action,
      link: "portfolio",
    });
  }

  const withoutDescription = services.filter((service) => !service.hasDescription).length;
  if (services.length > 0 && withoutDescription > 0 && withoutDescription * 2 >= services.length) {
    out.push({
      id: "services-no-description",
      weight: 42,
      step: "services",
      title: T.items.servicesNoDescription.title,
      text: T.items.servicesNoDescription.text(withoutDescription, services.length),
      actionLabel: T.items.servicesNoDescription.action,
      link: "services",
    });
  }

  if (services.length >= 3 && facts.packagesCount === 0) {
    out.push({
      id: "packages-none",
      weight: 30,
      step: "services",
      title: T.items.packagesNone.title,
      text: T.items.packagesNone.text,
      actionLabel: T.items.packagesNone.action,
      link: "services",
    });
  }

  if (reviews.count === 0 && bookings.completed >= 3) {
    out.push({
      id: "reviews-none",
      weight: 45,
      title: T.items.reviewsNone.title,
      text: T.items.reviewsNone.text(bookings.completed),
      actionLabel: T.items.reviewsNone.action,
      link: "reviews",
    });
  }

  if (bookings.uniqueClients >= 10 && bookings.returningClients / bookings.uniqueClients < 0.15) {
    out.push({
      id: "repeat-low",
      weight: 32,
      title: T.items.repeatLow.title,
      text: T.items.repeatLow.text(bookings.returningClients, bookings.uniqueClients),
      actionLabel: T.items.repeatLow.action,
      link: "clients",
    });
  }

  if (!profile.hasSocials) {
    out.push({
      id: "socials-none",
      weight: 20,
      step: "profile",
      title: T.items.socialsNone.title,
      text: T.items.socialsNone.text,
      actionLabel: T.items.socialsNone.action,
      link: "profile",
    });
  }

  return out;
}

function masterCandidates(facts: Extract<CabinetFacts, { scope: "master" }>): Candidate[] {
  const out: Candidate[] = [];
  const load = aheadLoad(facts.schedule);

  if (facts.schedule.workingDaysAhead === 0) {
    out.push({
      id: "no-schedule-ahead",
      weight: 100,
      step: "schedule",
      title: T.items.noScheduleAhead.title,
      text: T.items.noScheduleAhead.text,
      actionLabel: T.items.noScheduleAhead.action,
      link: "schedule",
    });
  }

  if (!facts.rules.autoConfirmBookings && facts.bookings.expiredUnconfirmed >= 1) {
    out.push({
      id: "expired-unconfirmed",
      weight: 88,
      step: "rules",
      title: T.items.expiredUnconfirmed.title,
      text: T.items.expiredUnconfirmed.text(facts.bookings.expiredUnconfirmed),
      actionLabel: T.items.expiredUnconfirmed.action,
      link: "rules",
    });
  }

  // Горящие окошки — только если тариф их даёт: совет не продаёт тариф.
  if (facts.hotSlots.allowed && !facts.hotSlots.enabled && facts.schedule.workingDaysAhead > 0 && (load === null || load < 0.5)) {
    out.push({
      id: "hot-slots-off",
      weight: 58,
      title: T.items.hotSlotsOff.title,
      text: T.items.hotSlotsOff.text,
      actionLabel: T.items.hotSlotsOff.action,
      link: "hotSlots",
    });
  }

  return out;
}

function studioCandidates(facts: Extract<CabinetFacts, { scope: "studio" }>): Candidate[] {
  const out: Candidate[] = [];

  if (facts.masters.length === 0) {
    out.push({
      id: "masters-none",
      weight: 100,
      step: "masters",
      title: T.items.mastersNone.title,
      text: T.items.mastersNone.text,
      actionLabel: T.items.mastersNone.action,
      link: "inviteMaster",
    });
    return out;
  }

  const noSchedule = facts.masters.filter((master) => master.workingDaysAhead === 0).map((master) => master.name);
  if (noSchedule.length > 0) {
    out.push({
      id: "masters-no-schedule",
      weight: 95,
      step: "schedule",
      title: T.items.mastersNoSchedule.title,
      text: T.items.mastersNoSchedule.text(joinNames(noSchedule)),
      actionLabel: T.items.mastersNoSchedule.action,
      link: "teamSchedule",
    });
  }

  const noServices = facts.masters.filter((master) => master.servicesCount === 0).map((master) => master.name);
  if (noServices.length > 0) {
    out.push({
      id: "masters-no-services",
      weight: 92,
      step: "assign",
      title: T.items.mastersNoServices.title,
      text: T.items.mastersNoServices.text(joinNames(noServices)),
      actionLabel: T.items.mastersNoServices.action,
      link: "services",
    });
  }

  if (facts.bookings.expiredUnconfirmed >= 1) {
    out.push({
      id: "expired-unconfirmed",
      weight: 88,
      title: T.items.expiredUnconfirmedStudio.title,
      text: T.items.expiredUnconfirmedStudio.text(facts.bookings.expiredUnconfirmed),
      actionLabel: T.items.expiredUnconfirmedStudio.action,
      link: "team",
    });
  }

  if (!facts.rules.remindersEnabled && (facts.bookings.past > 0 || facts.bookings.upcoming > 0)) {
    out.push({
      id: "reminders-off",
      weight: 78,
      step: "rules",
      title: T.items.remindersOff.title,
      text: T.items.remindersOff.text,
      actionLabel: T.items.remindersOff.action,
      link: "rules",
    });
  }

  // Неровная загрузка: самый занятый мастер и самый свободный среди работающих.
  const working = facts.masters
    .filter((master) => master.workMinutesAhead > 0)
    .map((master) => ({ name: master.name, load: master.bookedMinutesAhead / master.workMinutesAhead }));
  if (working.length >= 2) {
    const sorted = [...working].sort((a, b) => b.load - a.load);
    const busy = sorted[0]!;
    const free = sorted[sorted.length - 1]!;
    if (busy.load >= 0.7 && free.load <= 0.2) {
      out.push({
        id: "team-load-uneven",
        weight: 46,
        title: T.items.teamLoadUneven.title,
        text: T.items.teamLoadUneven.text(busy.name, percent(Math.min(1, busy.load)), free.name, percent(free.load)),
        actionLabel: T.items.teamLoadUneven.action,
        link: "services",
      });
    }
  }

  if (facts.photosWithoutPerformer >= 3) {
    out.push({
      id: "photos-without-performer",
      weight: 28,
      title: T.items.photosWithoutPerformer.title,
      text: T.items.photosWithoutPerformer.text(facts.photosWithoutPerformer),
      actionLabel: T.items.photosWithoutPerformer.action,
      link: "portfolio",
    });
  }

  return out;
}

export function buildCabinetTips(
  facts: CabinetFacts,
  options: { openSetupSteps?: readonly SetupStepId[]; limit?: number } = {},
): CabinetTip[] {
  const openSteps = new Set(options.openSetupSteps ?? []);
  const limit = options.limit ?? CABINET_TIPS_LIMIT;
  const candidates = [
    ...commonCandidates(facts),
    ...(facts.scope === "master" ? masterCandidates(facts) : studioCandidates(facts)),
  ];

  const tips: CabinetTip[] = [];
  for (const candidate of candidates.sort((a, b) => b.weight - a.weight)) {
    if (candidate.step && openSteps.has(candidate.step)) continue;
    const href = cabinetHref(facts.scope, candidate.link);
    if (!href) continue;
    tips.push({
      id: candidate.id,
      title: candidate.title,
      text: candidate.text,
      action: { label: candidate.actionLabel, href },
    });
    if (tips.length >= limit) break;
  }
  return tips;
}
