import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";

/**
 * STUDIO-PROFILE-PERSONAL-RULES — на расписании профиля в студии (`?profile=`)
 * те же четыре вкладки, но только с ЛИЧНЫМИ правилами мастера: «Правила» без
 * отмены записи и горящих окошек, «Видимость» без видимости страницы и
 * точности времени (роут их изменение отказывает), над вкладкой — пояснение,
 * что окно записи действует строже из правил мастера и студии. Личное
 * расписание — как прежде, всё на месте.
 *
 * Вкладки настоящие, секции заменены метками: проверяется, ЧТО смонтировано.
 * «Как клиенты видят окошки» — настоящая (проверяются её строки).
 *
 * @probe  2026-10-30: в `RulesTab` убрана ветка `studioProfile ? null` →
 *         красный «профиль в студии, «Правила»: …» (CANCELLATION_SECTION и
 *         HOT_SLOTS_SECTION снова на экране).
 * @probe  2026-10-30: `showPrecision={!studioProfile}` → `showPrecision` →
 *         красный «профиль в студии, «Видимость»: …» (строка «Точность
 *         времени» вернулась).
 * @probe  2026-10-30: условие пояснения `active !== "calendar"` снято →
 *         красный «профиль в студии: календарь без пояснения».
 */

const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/cabinet/master/schedule/settings",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("./rules/booking-window-section", () => ({ BookingWindowSection: () => "BOOKING_WINDOW_SECTION" }));
vi.mock("./rules/confirmation-section", () => ({ ConfirmationSection: () => "CONFIRMATION_SECTION" }));
vi.mock("./rules/cancellation-section", () => ({ CancellationSection: () => "CANCELLATION_SECTION" }));
vi.mock("./rules/hot-slots-section", () => ({ HotSlotsSection: () => "HOT_SLOTS_SECTION" }));
vi.mock("./breaks/buffer-section", () => ({ BufferSection: () => "BUFFER_SECTION" }));
vi.mock("./visibility/new-clients-section", () => ({ NewClientsSection: () => "NEW_CLIENTS_SECTION" }));
vi.mock("./studio-approval-banner", () => ({ StudioApprovalBanner: () => "APPROVAL_BANNER" }));
vi.mock("./calendar/schedule-calendar-tab", () => ({ ScheduleCalendarTab: () => "CALENDAR_TAB" }));
vi.mock("./plan/schedule-plan-card", () => ({ SchedulePlanCard: () => "PLAN_CARD" }));

const { ScheduleSettingsBody } = await import("./schedule-settings-body");
const { ScheduleEndpointProvider } = await import("./schedule-endpoint-context");
const { SaveStatusProvider } = await import("./save-status-provider");

const T = UI_TEXT.cabinetMaster.scheduleSettings;
const SLOT = T.visibility.slot;

const SNAPSHOT = {
  slotStepMin: 30,
  bufferBetweenBookingsMin: 10,
  bookingRules: {
    minHoursAhead: 2,
    maxDaysAhead: 30,
    autoConfirm: true,
    freeCancelHours: 24,
    lateCancelAction: "none",
  },
  visibility: {
    isPublished: true,
    slotPrecision: "exact",
    visibleSlotDays: 14,
    acceptNewClients: true,
  },
  hotSlots: null,
} as unknown as ScheduleEditorSnapshot;

function render(studioProfileId: string | null): string {
  return renderToStaticMarkup(
    <SaveStatusProvider>
      <ScheduleEndpointProvider studioProfileId={studioProfileId}>
        <ScheduleSettingsBody initialSnapshot={SNAPSHOT} hotSlotsAllowed studioApproval={null} />
      </ScheduleEndpointProvider>
    </SaveStatusProvider>,
  );
}

beforeEach(() => {
  search.value = "";
});

describe("настройки расписания — профиль в студии", () => {
  it("четыре вкладки, как у личного расписания", () => {
    const html = render("profile-in-studio");
    for (const label of [T.tabs.calendar, T.tabs.breaks, T.tabs.rules, T.tabs.visibility]) {
      expect(html).toContain(label);
    }
  });

  it("профиль в студии: календарь без пояснения", () => {
    const html = render("profile-in-studio");
    expect(html).toContain("CALENDAR_TAB");
    expect(html).not.toContain('data-testid="studio-profile-rules-note"');
  });

  it("профиль в студии, «Перерывы»: пауза и пояснение", () => {
    search.value = "tab=breaks";
    const html = render("profile-in-studio");
    expect(html).toContain("BUFFER_SECTION");
    expect(html).toContain('data-testid="studio-profile-rules-note"');
    expect(html).toContain(T.studioProfileRulesNote);
  });

  it("профиль в студии, «Правила»: окно записи и подтверждение — без отмены и горящих окошек", () => {
    search.value = "tab=rules";
    const html = render("profile-in-studio");
    expect(html).toContain("BOOKING_WINDOW_SECTION");
    expect(html).toContain("CONFIRMATION_SECTION");
    expect(html).not.toContain("CANCELLATION_SECTION");
    expect(html).not.toContain("HOT_SLOTS_SECTION");
    expect(html).toContain(T.studioProfileRulesNote);
  });

  it("профиль в студии, «Видимость»: дни и новые клиенты — без страницы и точности времени", () => {
    search.value = "tab=visibility";
    const html = render("profile-in-studio");
    expect(html).toContain(SLOT.daysTitle);
    expect(html).toContain("NEW_CLIENTS_SECTION");
    expect(html).not.toContain(SLOT.precisionTitle);
    expect(html).not.toContain(SLOT.publishedTitle);
    expect(html).toContain(T.studioProfileRulesNote);
  });
});

describe("настройки расписания — личное расписание", () => {
  it("«Правила»: все секции, без пояснения профиля в студии", () => {
    search.value = "tab=rules";
    const html = render(null);
    for (const marker of [
      "BOOKING_WINDOW_SECTION",
      "CONFIRMATION_SECTION",
      "CANCELLATION_SECTION",
      "HOT_SLOTS_SECTION",
    ]) {
      expect(html).toContain(marker);
    }
    expect(html).not.toContain(T.studioProfileRulesNote);
  });

  it("«Видимость»: точность времени на месте", () => {
    search.value = "tab=visibility";
    const html = render(null);
    expect(html).toContain(SLOT.precisionTitle);
    expect(html).toContain(SLOT.daysTitle);
  });
});
