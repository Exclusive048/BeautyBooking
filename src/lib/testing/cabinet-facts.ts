import type { MasterCabinetFacts, StudioCabinetFacts } from "@/lib/cabinet-insights/types";

/**
 * AI-CABINET-ANALYSIS — «здоровый» кабинет для тестов советов и ИИ-разбора:
 * ни одно правило совета на нём не срабатывает, поэтому тест меняет ровно тот
 * факт, о котором говорит, и видит ровно один совет. Только для тестов.
 */

type CommonOverrides = {
  [K in keyof Omit<MasterCabinetFacts, "scope" | "hotSlots">]?: Partial<MasterCabinetFacts[K]>;
};

function common(overrides: CommonOverrides = {}): Omit<MasterCabinetFacts, "scope" | "hotSlots"> {
  return {
    timeZone: "Asia/Yekaterinburg",
    profile: {
      name: "Анна Соколова",
      description: "Маникюр и педикюр в спокойной студии у метро. Работаю аккуратно, без спешки, стерильные инструменты и только проверенные материалы.",
      hasAvatar: true,
      hasAddress: true,
      isPublished: true,
      hasSocials: true,
      ...overrides.profile,
    },
    services: (overrides.services as MasterCabinetFacts["services"] | undefined) ?? [
      { name: "Маникюр", priceKopeks: 150_000, durationMin: 60, hasDescription: true, bookings: 12 },
      { name: "Педикюр", priceKopeks: 200_000, durationMin: 90, hasDescription: true, bookings: 6 },
    ],
    packagesCount: (overrides.packagesCount as number | undefined) ?? 1,
    portfolioCount: (overrides.portfolioCount as number | undefined) ?? 12,
    bookings: {
      past: 20,
      completed: 18,
      cancelledByClient: 1,
      cancelledByProvider: 0,
      expiredUnconfirmed: 0,
      noShow: 0,
      upcoming: 8,
      onlineShare: 0.6,
      avgLeadHours: 48,
      lastMinuteShare: 0.1,
      uniqueClients: 12,
      returningClients: 5,
      busiestWeekdays: [5, 6],
      timeOfDay: { morning: 4, day: 8, evening: 6 },
      ...overrides.bookings,
    },
    schedule: {
      workingDaysAhead: 10,
      workMinutesAhead: 6000,
      bookedMinutesAhead: 3000,
      configuredUntil: null,
      ...overrides.schedule,
    },
    reviews: { count: 10, avg: 4.8, unanswered: 0, recent: [], ...overrides.reviews },
    rules: {
      minBookingHoursAhead: 2,
      maxBookingDaysAhead: 30,
      cancellationDeadlineHours: 24,
      autoConfirmBookings: true,
      remindersEnabled: true,
      acceptNewClients: true,
      ...overrides.rules,
    },
  };
}

export function masterFacts(
  overrides: CommonOverrides & { hotSlots?: Partial<MasterCabinetFacts["hotSlots"]> } = {},
): MasterCabinetFacts {
  const { hotSlots, ...rest } = overrides;
  return {
    scope: "master",
    ...common(rest),
    hotSlots: { allowed: true, enabled: true, ...hotSlots },
  };
}

export function studioFacts(
  overrides: CommonOverrides & Partial<Pick<StudioCabinetFacts, "masters" | "pendingInvites" | "photosWithoutPerformer">> = {},
): StudioCabinetFacts {
  const { masters, pendingInvites, photosWithoutPerformer, ...rest } = overrides;
  return {
    scope: "studio",
    ...common({ profile: { name: "Vision Beauty Studio" }, ...rest }),
    masters: masters ?? [
      { name: "Марина", servicesCount: 4, workingDaysAhead: 10, workMinutesAhead: 6000, bookedMinutesAhead: 3000, completed: 10 },
      { name: "Ольга", servicesCount: 3, workingDaysAhead: 8, workMinutesAhead: 4800, bookedMinutesAhead: 2400, completed: 8 },
    ],
    pendingInvites: pendingInvites ?? 0,
    photosWithoutPerformer: photosWithoutPerformer ?? 0,
  };
}
