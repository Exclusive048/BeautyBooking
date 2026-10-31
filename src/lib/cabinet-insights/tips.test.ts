import { describe, expect, it } from "vitest";
import { masterFacts, studioFacts } from "@/lib/testing/cabinet-facts";
import { CABINET_TIPS_LIMIT, buildCabinetTips } from "./tips";

/**
 * AI-CABINET-ANALYSIS — советы на главной кабинета. Каждый совет срабатывает от
 * своего факта и ведёт в раздел ЭТОГО кабинета; о шаге, на который ведут
 * «Первые шаги», совет молчит.
 */

const ids = (tips: ReturnType<typeof buildCabinetTips>) => tips.map((tip) => tip.id);

describe("buildCabinetTips", () => {
  it("на здоровом кабинете советов нет — фикстура ничего не включает сама", () => {
    expect(buildCabinetTips(masterFacts())).toEqual([]);
    expect(buildCabinetTips(studioFacts())).toEqual([]);
  });

  it("мастер без расписания впереди — первый совет, ведёт в настройки расписания", () => {
    const tips = buildCabinetTips(masterFacts({ schedule: { workingDaysAhead: 0, workMinutesAhead: 0, bookedMinutesAhead: 0 } }));
    expect(tips[0]).toMatchObject({
      id: "no-schedule-ahead",
      action: { href: "/cabinet/master/schedule/settings" },
    });
  });

  it("о шаге, на который ведут «Первые шаги», совет молчит", () => {
    const facts = masterFacts({
      schedule: { workingDaysAhead: 0, workMinutesAhead: 0, bookedMinutesAhead: 0 },
      profile: { description: null },
    });
    expect(ids(buildCabinetTips(facts))).toContain("no-schedule-ahead");
    const tips = buildCabinetTips(facts, { openSetupSteps: ["schedule", "profile"] });
    expect(ids(tips)).not.toContain("no-schedule-ahead");
    expect(ids(tips)).not.toContain("description-missing");
  });

  it("порядок — по весу, показываются первые CABINET_TIPS_LIMIT", () => {
    const tips = buildCabinetTips(
      masterFacts({
        rules: { acceptNewClients: false, maxBookingDaysAhead: 7 },
        profile: { description: null, hasSocials: false },
        portfolioCount: 3,
      }),
    );
    expect(tips).toHaveLength(CABINET_TIPS_LIMIT);
    expect(ids(tips)).toEqual(["new-clients-closed", "description-missing", "portfolio-thin", "max-days-ahead-short"]);
  });

  it("доли не считаются на малой выборке", () => {
    const tips = buildCabinetTips(masterFacts({ bookings: { past: 5, cancelledByClient: 3, noShow: 2 } }));
    expect(ids(tips)).not.toContain("client-cancellations");
    expect(ids(tips)).not.toContain("no-shows");
  });

  it("частые отмены клиентами ведут в правила записи своего кабинета", () => {
    const bookings = { past: 20, cancelledByClient: 5 };
    expect(buildCabinetTips(masterFacts({ bookings }))[0]).toMatchObject({
      id: "client-cancellations",
      action: { href: "/cabinet/master/schedule/settings?tab=rules" },
    });
    expect(buildCabinetTips(studioFacts({ bookings }))[0]).toMatchObject({
      id: "client-cancellations",
      action: { href: "/cabinet/studio/settings?section=policy" },
    });
  });

  it("отмены со стороны кабинета: мастеру — расписание, студии — график команды", () => {
    const bookings = { past: 20, cancelledByProvider: 4 };
    const master = buildCabinetTips(masterFacts({ bookings })).find((tip) => tip.id === "provider-cancellations");
    const studio = buildCabinetTips(studioFacts({ bookings })).find((tip) => tip.id === "provider-cancellations");
    expect(master?.action.href).toBe("/cabinet/master/schedule/settings");
    expect(studio?.action.href).toBe("/cabinet/studio/schedule/team");
  });

  it("горящие окошки предлагаются, только если их даёт тариф", () => {
    // Совет — при загрузке впереди меньше половины.
    const schedule = { bookedMinutesAhead: 2000 };
    const off = { enabled: false };
    expect(ids(buildCabinetTips(masterFacts({ schedule, hotSlots: off })))).toContain("hot-slots-off");
    expect(ids(buildCabinetTips(masterFacts({ schedule: { bookedMinutesAhead: 3000 }, hotSlots: off })))).not.toContain(
      "hot-slots-off",
    );
    expect(ids(buildCabinetTips(masterFacts({ schedule, hotSlots: { ...off, allowed: false } })))).not.toContain(
      "hot-slots-off",
    );
  });

  it("студия без мастеров — приглашение мастера первым", () => {
    const tips = buildCabinetTips(studioFacts({ masters: [] }));
    expect(tips[0]).toMatchObject({ id: "masters-none", action: { href: "/cabinet/studio/team/add" } });
  });

  it("студия: мастера без графика и без услуг названы по именам", () => {
    const tips = buildCabinetTips(
      studioFacts({
        masters: [
          { name: "Марина", servicesCount: 0, workingDaysAhead: 0, workMinutesAhead: 0, bookedMinutesAhead: 0, completed: 0 },
          { name: "Ольга", servicesCount: 3, workingDaysAhead: 8, workMinutesAhead: 4800, bookedMinutesAhead: 2400, completed: 8 },
        ],
      }),
    );
    const noSchedule = tips.find((tip) => tip.id === "masters-no-schedule");
    const noServices = tips.find((tip) => tip.id === "masters-no-services");
    expect(noSchedule?.text).toContain("Марина");
    expect(noSchedule?.text).not.toContain("Ольга");
    expect(noSchedule?.action.href).toBe("/cabinet/studio/schedule/team");
    expect(noServices?.action.href).toBe("/cabinet/studio/services");
  });

  it("студия: неровная загрузка называет самого занятого и самого свободного", () => {
    const tip = buildCabinetTips(
      studioFacts({
        masters: [
          { name: "Марина", servicesCount: 4, workingDaysAhead: 10, workMinutesAhead: 6000, bookedMinutesAhead: 5400, completed: 10 },
          { name: "Ольга", servicesCount: 3, workingDaysAhead: 8, workMinutesAhead: 4800, bookedMinutesAhead: 480, completed: 8 },
        ],
      }),
    ).find((item) => item.id === "team-load-uneven");
    expect(tip?.text).toContain("Марина");
    expect(tip?.text).toContain("90");
    expect(tip?.text).toContain("Ольга");
    expect(tip?.text).toContain("10");
  });

  it("у мастера нет советов про разделы студии и наоборот", () => {
    const master = buildCabinetTips(masterFacts({ rules: { autoConfirmBookings: false }, bookings: { expiredUnconfirmed: 2 } }));
    expect(master.every((tip) => tip.action.href.startsWith("/cabinet/master/"))).toBe(true);
    const studio = buildCabinetTips(studioFacts({ rules: { remindersEnabled: false }, bookings: { expiredUnconfirmed: 2 } }));
    expect(ids(studio)).toEqual(expect.arrayContaining(["expired-unconfirmed", "reminders-off"]));
    expect(studio.every((tip) => tip.action.href.startsWith("/cabinet/studio/"))).toBe(true);
  });
});
