import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — «расписание скоро закончится»: за неделю до
 * конца настроенного расписания, одно уведомление на дату окончания, по дате
 * салона.
 */

const db = vi.hoisted(() => ({
  providers: [] as Array<{
    id: string;
    timezone: string;
    ownerUserId: string | null;
    name?: string;
    studioId?: string | null;
    studio?: { ownerUserId: string | null; studioProfile: { ownerUserId: string | null } | null } | null;
    schedulePatterns: Array<{ endsOn: string | null }>;
  }>,
  laterWorkingDays: 0,
  alreadySent: false,
}));
const delivered = vi.hoisted(
  () => [] as Array<{ userId: string; type: string; title: string; payloadJson: Record<string, unknown> }>,
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: async () => db.providers },
    scheduleOverride: { count: async () => db.laterWorkingDays },
    notification: { findFirst: async () => (db.alreadySent ? { id: "n1" } : null) },
  },
}));
vi.mock("@/lib/notifications/delivery", () => ({
  deliverNotification: async (input: {
    userId: string;
    type: string;
    title: string;
    payloadJson: Record<string, unknown>;
  }) => {
    delivered.push(input);
  },
}));

import { runScheduleEndingReminders } from "@/lib/schedule/schedule-ending";

const NOW = new Date("2026-10-01T09:00:00.000Z"); // Москва: 1 октября, 12:00

beforeEach(() => {
  db.providers = [
    { id: "p1", timezone: "Europe/Moscow", ownerUserId: "u1", schedulePatterns: [{ endsOn: "2026-10-05" }] },
  ];
  db.laterWorkingDays = 0;
  db.alreadySent = false;
  delivered.length = 0;
});

describe("runScheduleEndingReminders", () => {
  it("расписание кончается через 4 дня — мастеру уходит напоминание с датой и ссылкой на настройки", async () => {
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 1 });
    expect(delivered[0]?.userId).toBe("u1");
    expect(delivered[0]?.payloadJson).toMatchObject({ providerId: "p1", endsOn: "2026-10-05" });
  });

  it("берётся последний день настроенного расписания", async () => {
    db.providers[0]!.schedulePatterns = [{ endsOn: "2026-10-02" }, { endsOn: "2026-10-06" }];
    await runScheduleEndingReminders(NOW);
    expect(delivered[0]?.payloadJson).toMatchObject({ endsOn: "2026-10-06" });
  });

  it("до конца больше недели — рано", async () => {
    db.providers[0]!.schedulePatterns = [{ endsOn: "2026-10-09" }];
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 0 });
  });

  it("одно напоминание на дату окончания", async () => {
    db.alreadySent = true;
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 0 });
  });

  it("рабочие дни, отмеченные в календаре после конца графика, — напоминать не о чем", async () => {
    db.laterWorkingDays = 2;
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 0 });
  });

  it("дата — по поясу салона: у Камчатки 1 октября UTC — уже 2 октября", async () => {
    db.providers[0]!.timezone = "Asia/Kamchatka";
    db.providers[0]!.schedulePatterns = [{ endsOn: "2026-10-01" }];
    // 2026-10-01T15:00Z = 2 октября 03:00 на Камчатке: расписание уже кончилось.
    await expect(runScheduleEndingReminders(new Date("2026-10-01T15:00:00.000Z"))).resolves.toMatchObject({ sent: 0 });
  });

  // SCHEDULE-STUDIO-PROFILE-CALENDAR: у профиля в студии график решает студия.
  it("профиль мастера в студии — напоминание владельцу студии, в «График команды»", async () => {
    db.providers[0] = {
      ...db.providers[0]!,
      name: "Марина",
      studioId: "studio-prov",
      studio: { ownerUserId: "u-prov-owner", studioProfile: { ownerUserId: "u-studio-owner" } },
    };
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 1 });
    expect(delivered[0]).toMatchObject({
      userId: "u-studio-owner",
      type: "STUDIO_SCHEDULE_ENDING",
      payloadJson: { providerId: "p1", settingsHref: "/cabinet/studio/schedule/team" },
    });
    expect(delivered[0]?.title).toBe("Расписание мастера скоро закончится");
  });

  it("у студии нет владельца — напоминать некому", async () => {
    db.providers[0] = {
      ...db.providers[0]!,
      studioId: "studio-prov",
      studio: { ownerUserId: null, studioProfile: { ownerUserId: null } },
    };
    await expect(runScheduleEndingReminders(NOW)).resolves.toMatchObject({ sent: 0 });
  });
});
