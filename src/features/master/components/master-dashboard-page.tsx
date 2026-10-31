import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { Building2, Crown } from "lucide-react";
import { env } from "@/lib/env";
import { AttentionSection } from "@/features/master/components/dashboard/attention-section";
import { QuickActionsSection } from "@/features/master/components/dashboard/quick-actions-section";
import { UpcomingBookingsSection } from "@/features/master/components/dashboard/upcoming-bookings-section";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import { Badge } from "@/components/ui/badge";
import { AppSetupCard } from "@/features/cabinet/components/app-setup-card";
import { CabinetHomeLower } from "@/features/cabinet/home/cabinet-home-lower";
import { FreeWindowsPanel } from "@/features/schedule-nav/components/free-windows-panel";
import { SetupGuideCard } from "@/features/cabinet/setup-guide/setup-guide-card";
import { loadMasterSetupGuide } from "@/lib/onboarding/setup-guide";
import { getSessionUserId } from "@/lib/auth/session";
import { getActionRequiredBookingCountsForMaster } from "@/lib/bookings/counts";
import { countUnreadChatMessages } from "@/lib/chat/conversation-aggregator";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { loadCabinetHomeInsights } from "@/lib/cabinet-insights/home";
import { getCurrentMasterProviderId, getMasterWorkProfiles } from "@/lib/master/access";
import { getMasterDashboardData } from "@/lib/master/dashboard.service";
import { getMasterScheduleWeek } from "@/lib/master/schedule.service";
import { parseIsoDateKey } from "@/lib/master/schedule-utils";
import { getUnansweredReviewsCountForMaster } from "@/lib/reviews/counts";
import { isScheduleEndingSoon } from "@/lib/schedule/calendar-shared";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { loadSchedulePlan } from "@/lib/schedule/patterns";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * Master cabinet dashboard — `/cabinet/master/dashboard`.
 *
 * Тонкий серверный оркестратор. Порядок (DASHBOARD-REORDER, запрос владельца
 * 2026-10-31): «Требуют внимания» (сгруппированные счётчики, те же, что
 * бейджи меню) → ближайшие записи со ссылкой в расписание → «Первые шаги» →
 * свободные окошки на неделю (расчёт вкладки «Расписание») → приложение →
 * быстрые действия и ИИ-разбор кабинета, советы и «Новое в МастерРядом»
 * (AI-CABINET-ANALYSIS, `lib/cabinet-insights/`). Аналитика (выручка недели, клиенты) — на странице
 * «Аналитика»; выручка дня — в подписи ближайших записей.
 */
export async function MasterDashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const masterId = await getCurrentMasterProviderId(userId);
  // STUDIO-MASTER-PROFILES (этап 4): рабочие списки — по всем профилям мастера.
  const workProfiles = await getMasterWorkProfiles(userId);
  const now = new Date();
  const dataPromise = getMasterDashboardData({ masterId, workProfiles, now });
  // Свободные окошки — неделя с сегодняшнего дня САЛОНА (rule 17): пояс мастера
  // приходит с данными главной, поэтому неделя стартует следом за ними, не
  // дожидаясь остальных запросов.
  const weekPromise = dataPromise.then((dashboard) =>
    getMasterScheduleWeek({
      masterId,
      // Сервис недели строит дни из полуночи процесса — даём ему её для даты салона.
      weekStart: parseIsoDateKey(toLocalDateKey(now, dashboard.master.timezone))!,
      workProfiles,
      now,
    }),
  );
  // SETUP-GUIDE-01: «Первые шаги» — пока кабинет не настроен до конца. Советы
  // молчат о шагах, на которые карточка ещё ведёт, поэтому идут следом за ней.
  const setupGuidePromise = loadMasterSetupGuide(userId);
  const insightsPromise = setupGuidePromise.then((setupGuide) =>
    loadCabinetHomeInsights({ userId, scope: "master", setupGuide, now }),
  );
  const [data, week, schedulePlan, setupGuide, subscription, attention, unreadMessages, unansweredReviews, insights] =
    await Promise.all([
      dataPromise,
      weekPromise,
      // SCHEDULE-PATTERNS-01 (этап 3): «расписание скоро закончится».
      loadSchedulePlan(masterId),
      setupGuidePromise,
      // Вид подписки — только на главной (решение владельца 2026-10-31). Строка
      // уже прочитана шеллом кабинета: `React.cache`, второго запроса нет.
      getCurrentSubscriptionRow(userId, SubscriptionScope.MASTER),
      // Счётчики «Требуют внимания» — те же, что бейджи меню кабинета.
      getActionRequiredBookingCountsForMaster(workProfiles.allIds),
      countUnreadChatMessages({ userId, perspective: "MASTER" }),
      getUnansweredReviewsCountForMaster(masterId),
      insightsPromise,
    ]);
  const scheduleEndsOn = isScheduleEndingSoon(schedulePlan) ? schedulePlan.configuredUntil : null;
  const timezone = data.master.timezone;
  const todayKey = toLocalDateKey(now, timezone);

  const publicProfileUrl = data.master.publicUsername
    ? `${env.NEXT_PUBLIC_APP_URL ?? ""}/u/${data.master.publicUsername}` || `/u/${data.master.publicUsername}`
    : null;

  const HEADER = UI_TEXT.cabinetMaster.pageHeader;
  const HOME_TITLE = UI_TEXT.cabinetMaster.pageTitles.home;
  const PLAN = UI_TEXT.cabinetMaster.dashboard.planBadge;

  const onTrial = isActiveTrial(subscription);
  const planTier = onTrial ? "PREMIUM" : (subscription?.planTier ?? "FREE");
  const planLabel =
    planTier === "PREMIUM" ? PLAN.labels.premium : planTier === "PRO" ? PLAN.labels.pro : PLAN.labels.free;
  const trialDays = onTrial ? Math.max(trialDaysLeft(subscription.trialEndsAt), 0) : null;

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: HEADER.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: HOME_TITLE.title },
        ]}
        title={HOME_TITLE.title}
        // PWA-UX-BATCH-01: «Новая запись» стоит на строке заголовка и на
        // телефоне (`actionsInline`) — заголовок короткий, действие одно, а
        // отдельная строка под ним отнимала ~60px первого экрана кабинета.
        actionsInline
        actions={
          <>
            <Link
              href="/cabinet/master/billing"
              aria-label={PLAN.aria(planLabel)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Badge
                size="xs"
                variant={planTier === "FREE" ? "muted" : "default"}
                className="gap-1 transition-colors hover:border-primary"
              >
                {/* На 375px шапка — «Главная» + плашка + «Новая запись» в одну
                    строку: корона и дни пробного периода появляются с `sm`,
                    иначе обрезается заголовок. Об окончании пробного периода
                    за 3 дня скажет баннер шелла. */}
                {planTier === "FREE" ? null : (
                  <Crown className="hidden h-3 w-3 shrink-0 text-accent-text sm:block" aria-hidden />
                )}
                {planLabel}
                {trialDays !== null ? (
                  <span className="hidden sm:inline">{PLAN.trialDays(trialDays)}</span>
                ) : null}
              </Badge>
            </Link>
            <NewBookingButton label={HEADER.newBookingCta} className="rounded-xl" />
          </>
        }
      />
      <FocusHighlighter />

      <div className="space-y-4 px-4 pb-6 pt-3 md:space-y-6 md:px-6 md:pt-4 lg:px-8">
        {/* QA-115 (FIX-06): studio context for a studio master (nothing for independent). */}
        {data.master.studio ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-card px-3 py-1 text-xs text-text-sec">
            <Building2 className="h-3.5 w-3.5 text-accent-text" aria-hidden strokeWidth={1.6} />
            <span>
              {UI_TEXT.cabinetMaster.dashboard.studioChipTemplate.replace(
                "{name}",
                data.master.studio.name,
              )}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[1fr_1.4fr]">
          <AttentionSection
            pendingConfirmation={attention.pendingConfirmation}
            rescheduleRequests={attention.rescheduleRequests}
            unreadMessages={unreadMessages}
            unansweredReviews={unansweredReviews}
            scheduleEndsOn={scheduleEndsOn}
          />
          <UpcomingBookingsSection
            upcoming={data.upcomingBookings}
            totalTodayCount={data.todayBookings.length}
            todayRevenueKopeks={data.kpis.todayRevenue}
            timezone={timezone}
            showWorkContext={data.showWorkContext}
          />
        </div>

        {/* «Первые шаги» — под тем, что ждёт ответа сейчас (DASHBOARD-REORDER). */}
        {setupGuide && !setupGuide.hidden ? <SetupGuideCard guide={setupGuide} /> : null}

        <FreeWindowsPanel
          sections={[
            {
              id: "master",
              title: null,
              days: week.days.map((day) => ({
                dateKey: day.iso,
                isOff: day.isOff,
                past: day.isPast,
                windows: day.freeWindows.windows,
                freeStarts: day.freeWindows.freeStarts,
              })),
            },
          ]}
          timeZone={timezone}
          zoneIso={localDayRangeUtc(todayKey, timezone).startUtc.toISOString()}
          href="/cabinet/master/schedule"
          linkLabel={UI_TEXT.schedule.freeWindows.toSchedule}
        />

        {/* PWA-ONBOARDING-01: установка приложения + уведомления (скрывается сама). */}
        <AppSetupCard />

        <CabinetHomeLower
          scope="master"
          quickActions={<QuickActionsSection publicProfileUrl={publicProfileUrl} />}
          insights={insights}
          billingHref="/cabinet/master/billing"
          timeZone={timezone}
        />
      </div>

    </>
  );
}
