import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";

/**
 * STUDIO-PROFILE-RULES-TAB-STATE — на расписании профиля в студии
 * (`?profile=`) мастер не видит вкладок «Перерывы», «Правила», «Видимость»:
 * их значения меняет студия, а роут на изменение отвечает 403. Вместо вкладок —
 * пояснение, кто их задаёт. Старая ссылка `?tab=rules` открывает календарь.
 * Личное расписание — с прежними четырьмя вкладками.
 *
 * Вкладки и тяжёлые блоки заменены метками: проверяется, ЧТО смонтировано, а
 * не вёрстка вкладок.
 *
 * @probe  2026-10-30: `const tabs = TABS` (без ветки профиля в студии) →
 *         красный «профиль в студии: …»: по старой ссылке `?tab=rules`
 *         снова монтировались «Правила» с автосохранением, хотя полосы
 *         вкладок уже не было.
 */

const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/cabinet/master/schedule/settings",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("./breaks-tab", () => ({ BreaksTab: () => "BREAKS_TAB" }));
vi.mock("./rules-tab", () => ({ RulesTab: () => "RULES_TAB" }));
vi.mock("./visibility-tab", () => ({ VisibilityTab: () => "VISIBILITY_TAB" }));
vi.mock("./studio-approval-banner", () => ({ StudioApprovalBanner: () => "APPROVAL_BANNER" }));
vi.mock("./calendar/schedule-calendar-tab", () => ({ ScheduleCalendarTab: () => "CALENDAR_TAB" }));
vi.mock("./plan/schedule-plan-card", () => ({ SchedulePlanCard: () => "PLAN_CARD" }));

const { ScheduleSettingsBody } = await import("./schedule-settings-body");
const { ScheduleEndpointProvider } = await import("./schedule-endpoint-context");

const T = UI_TEXT.cabinetMaster.scheduleSettings;

function render(studioProfileId: string | null): string {
  return renderToStaticMarkup(
    <ScheduleEndpointProvider studioProfileId={studioProfileId}>
      <ScheduleSettingsBody
        initialSnapshot={{} as ScheduleEditorSnapshot}
        hotSlotsAllowed
        studioApproval={null}
      />
    </ScheduleEndpointProvider>,
  );
}

beforeEach(() => {
  search.value = "tab=rules";
});

describe("настройки расписания — вкладки профиля в студии", () => {
  it("профиль в студии: только календарь и пояснение «задаёт студия»", () => {
    const html = render("profile-in-studio");

    expect(html).toContain("CALENDAR_TAB");
    expect(html).not.toContain("RULES_TAB");
    expect(html).toContain('data-testid="studio-profile-settings-note"');
    expect(html).toContain(T.studioProfileSettingsNote);
    // Подписи вкладок с заглавной; в пояснении те же слова — строчными.
    for (const label of [T.tabs.breaks, T.tabs.rules, T.tabs.visibility]) {
      expect(html).not.toContain(label);
    }
  });

  it("личное расписание: четыре вкладки, `?tab=rules` открывает правила", () => {
    const html = render(null);

    expect(html).toContain("RULES_TAB");
    expect(html).not.toContain("CALENDAR_TAB");
    expect(html).not.toContain(T.studioProfileSettingsNote);
    for (const label of [T.tabs.calendar, T.tabs.breaks, T.tabs.rules, T.tabs.visibility]) {
      expect(html).toContain(label);
    }
  });

  it("профиль в студии без `?tab=` — календарь", () => {
    search.value = "";
    const html = render("profile-in-studio");

    expect(html).toContain("CALENDAR_TAB");
  });
});
