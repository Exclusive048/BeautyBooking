import type { ComponentProps } from "react";
import { AppSetupCard } from "@/features/cabinet/components/app-setup-card";
import { CabinetHomeLower } from "@/features/cabinet/home/cabinet-home-lower";
import { SetupGuideCard } from "@/features/cabinet/setup-guide/setup-guide-card";
import { FreeWindowsPanel } from "@/features/schedule-nav/components/free-windows-panel";
import type { StudioScheduleData } from "@/features/studio-cabinet/schedule/server/types";
import type { CabinetHomeInsights } from "@/lib/cabinet-insights/home";
import type { SetupGuideDto } from "@/lib/onboarding/setup-guide-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioAttentionSection } from "./studio-attention-section";
import { StudioQuickActions } from "./studio-quick-actions";
import { StudioTodayBanner } from "./studio-today-banner";
import { StudioUpcomingSection } from "./studio-upcoming-section";
import type { StudioHomeData } from "../server/dashboard-data.service";

/** Нижняя часть главной — только владельцу и администратору студии. */
export type StudioHomeLower = {
  insights: CabinetHomeInsights;
  quickActions: Omit<ComponentProps<typeof StudioQuickActions>, "timezone">;
};

type Props = {
  data: StudioHomeData;
  studioName: string;
  /** Непрочитанные сообщения клиентов в переписке студии; 0 — у мастера студии. */
  unreadMessages: number;
  /** Свободное время активных мастеров на неделю с сегодняшнего дня салона. */
  freeWindows: StudioScheduleData["freeWindows"];
  /** Момент, на который берётся смещение пояса для метки зоны окошек. */
  zoneIso: string;
  /** SETUP-GUIDE-01: «Первые шаги»; `null` — не показывать. */
  setupGuide?: SetupGuideDto | null;
  /** Конец действующего пробного периода (ISO); `null` — пробного нет. */
  trialEndsAt?: string | null;
  /** AI-CABINET-ANALYSIS: быстрые действия, ИИ-разбор, советы, новое; `null` — мастеру студии. */
  lower?: StudioHomeLower | null;
};

/** Дней окошек на мастера в списке главной (неделя — в календаре). */
const FREE_WINDOW_DAYS_PER_MASTER = 2;

/**
 * Главная кабинета студии (DASHBOARD-REORDER, запрос владельца 2026-10-31):
 * сегодня (компактно) → «Требуют внимания» и ближайшие записи → «Первые
 * шаги» → свободные окошки мастеров → установка приложения → быстрые
 * действия и ИИ-разбор, советы и «Новое в МастерРядом» (AI-CABINET-ANALYSIS,
 * владельцу и администратору). Показатели за
 * 30 дней, топ мастеров, загрузка, популярные услуги и выручка по мастерам —
 * в аналитике.
 */
export function StudioDashboardPage({
  data,
  studioName,
  unreadMessages,
  freeWindows,
  zoneIso,
  setupGuide = null,
  trialEndsAt = null,
  lower = null,
}: Props) {
  return (
    <div className="space-y-4 lg:space-y-6">
      <StudioTodayBanner data={data.todayBanner} studioName={studioName} trialEndsAt={trialEndsAt} />

      <div className="grid grid-cols-1 gap-4 lg:gap-5 xl:grid-cols-[1fr_1.4fr]">
        <StudioAttentionSection items={data.attentionItems} unreadMessages={unreadMessages} />
        <StudioUpcomingSection items={data.upcoming.items} total={data.upcoming.total} timeZone={data.timeZone} />
      </div>

      {/* «Первые шаги» — под тем, что ждёт ответа сейчас. */}
      {setupGuide && !setupGuide.hidden ? <SetupGuideCard guide={setupGuide} /> : null}

      <FreeWindowsPanel
        sections={freeWindows.map((master) => ({
          id: master.masterId,
          title: master.masterName,
          days: master.days,
        }))}
        timeZone={data.timeZone}
        zoneIso={zoneIso}
        href="/cabinet/studio/calendar"
        linkLabel={UI_TEXT.schedule.freeWindows.toCalendar}
        maxDaysPerSection={FREE_WINDOW_DAYS_PER_MASTER}
      />

      {/* PWA-ONBOARDING-01: установка приложения + уведомления (скрывается сама). */}
      <AppSetupCard />

      {lower ? (
        <CabinetHomeLower
          scope="studio"
          quickActions={<StudioQuickActions {...lower.quickActions} timezone={data.timeZone} />}
          insights={lower.insights}
          billingHref="/cabinet/studio/billing"
          timeZone={data.timeZone}
        />
      ) : null}
    </div>
  );
}
