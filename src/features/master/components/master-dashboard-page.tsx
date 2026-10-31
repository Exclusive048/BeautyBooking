import Link from "next/link";
import { redirect } from "next/navigation";
import { SubscriptionScope } from "@prisma/client";
import { Building2, Crown } from "lucide-react";
import { env } from "@/lib/env";
import { AnnouncementsSection } from "@/features/master/components/dashboard/announcements-section";
import { AttentionSection } from "@/features/master/components/dashboard/attention-section";
import { GreetingHero } from "@/features/master/components/dashboard/greeting-hero";
import { KpiCardsGrid } from "@/features/master/components/dashboard/kpi-cards-grid";
import { QuickActionsSection } from "@/features/master/components/dashboard/quick-actions-section";
import { UpcomingBookingsSection } from "@/features/master/components/dashboard/upcoming-bookings-section";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppSetupCard } from "@/features/cabinet/components/app-setup-card";
import { SetupGuideCard } from "@/features/cabinet/setup-guide/setup-guide-card";
import { loadMasterSetupGuide } from "@/lib/onboarding/setup-guide";
import { getSessionUser, getSessionUserId } from "@/lib/auth/session";
import {
  getCurrentSubscriptionRow,
  isActiveTrial,
  trialDaysLeft,
} from "@/lib/billing/get-current-subscription-row";
import { getCurrentMasterProviderId, getMasterWorkProfiles } from "@/lib/master/access";
import { getMasterDashboardData } from "@/lib/master/dashboard.service";
import { isScheduleEndingSoon } from "@/lib/schedule/calendar-shared";
import { loadSchedulePlan } from "@/lib/schedule/patterns";
import { getDayOfWeek } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * Master cabinet dashboard — `/cabinet/master/dashboard`.
 *
 * Rewritten in 23b as a thin server-component orchestrator. All data
 * (today's bookings, KPIs, attention items, services for the manual
 * modal) comes from `getMasterDashboardData` which fans out into a single
 * `Promise.all`. Two client islands handle interactive bits:
 *   - `<ManualBookingModal>` — listens to `?manual=1` to open
 *   - `<BookingActionButtons>` — confirm/decline pending bookings inline
 *
 * The pre-23b version was a 1488-line client component with a free-slots
 * carousel, story-card generator, date browser, and inline chat — all
 * removed in favour of the reference design. Free-slots logic now lives
 * inside the dashboard service as a "first big gap" hint surfaced through
 * the attention panel; the rest moved to dedicated pages or got dropped.
 */
export async function MasterDashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const masterId = await getCurrentMasterProviderId(userId);
  // FIX-VISUAL-POLISH F4: the page-header notification bell was removed (the
  // global topbar already carries the canonical `NotificationsBell` sitewide —
  // two bells were redundant), so the unread count is no longer fetched here.
  // The sidebar still surfaces it via the layout's own `getUnreadBadgeCount`.
  // STUDIO-MASTER-PROFILES (этап 4): рабочие списки — по всем профилям мастера.
  const workProfiles = await getMasterWorkProfiles(userId);
  const [data, schedulePlan, setupGuide, subscription] = await Promise.all([
    getMasterDashboardData({ masterId, workProfiles }),
    // SCHEDULE-PATTERNS-01 (этап 3): плашка «расписание скоро закончится».
    loadSchedulePlan(masterId),
    // SETUP-GUIDE-01: «Первые шаги» — пока кабинет не настроен до конца.
    loadMasterSetupGuide(userId),
    // Вид подписки — только на главной (решение владельца 2026-10-31). Строка
    // уже прочитана шеллом кабинета: `React.cache`, второго запроса нет.
    getCurrentSubscriptionRow(userId, SubscriptionScope.MASTER),
  ]);
  const scheduleEndsOn = isScheduleEndingSoon(schedulePlan) ? schedulePlan.configuredUntil : null;

  const firstName =
    sessionUser.firstName?.trim() ||
    sessionUser.displayName?.trim()?.split(/\s+/)[0] ||
    data.master.name.split(/\s+/)[0] ||
    "мастер";

  const now = new Date();
  // FIX-04 (QA-113): weekend computed in the master's own timezone, not the host TZ.
  const masterWeekday = getDayOfWeek(now, data.master.timezone);
  const isWeekend = masterWeekday === 0 || masterWeekday === 6;
  const adviceContext = {
    bookingsCount: data.todayBookings.length,
    hasPendingBookings: data.pendingBookings.length > 0,
    hasFreeSlotInNextHour: Boolean(
      data.freeSlot &&
        data.freeSlot.startAtUtc.getTime() - now.getTime() <= 60 * 60_000,
    ),
    isWeekend,
  };

  const next = data.upcomingBookings.find((b) => b.startAtUtc > now) ?? null;
  const nextBooking = next
    ? {
        startAtUtc: next.startAtUtc,
        clientName: next.clientName,
        serviceTitle: next.serviceTitle,
        clientAvatarUrl: null,
      }
    : null;

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

        {scheduleEndsOn ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-warning-border bg-warning-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-warning-text">
              {UI_TEXT.cabinetMaster.scheduleSettings.plan.endingSoonHint(
                // Дата-ключ салона — календарная дата без пояса: подпись в UTC полудня.
                UI_FMT.dateShort(`${scheduleEndsOn}T12:00:00.000Z`, { timeZone: "UTC" }),
              )}
            </p>
            <Button asChild variant="secondary" size="sm" className="shrink-0 rounded-xl">
              <Link href="/cabinet/master/schedule/settings">
                {UI_TEXT.cabinetMaster.scheduleSettings.plan.endingCta}
              </Link>
            </Button>
          </div>
        ) : null}

        {setupGuide && !setupGuide.hidden ? <SetupGuideCard guide={setupGuide} /> : null}

        <GreetingHero
          firstName={firstName}
          now={now}
          context={adviceContext}
          nextBooking={nextBooking}
          timezone={data.master.timezone}
        />

        {/* PWA-ONBOARDING-01: установка приложения + уведомления (скрывается сама). */}
        <AppSetupCard />

        <KpiCardsGrid
          todayRevenue={data.kpis.todayRevenue}
          todayBookingsCount={data.kpis.todayBookingsCount}
          todayCapacityHours={data.kpis.todayCapacityHours}
          weekRevenue={data.kpis.weekRevenue}
          newClientsCount={data.kpis.newClientsCount}
          returningClientsCount={data.kpis.returningClientsCount}
          revenueSplit={
            data.showWorkContext
              ? { today: data.kpis.todayRevenueSplit, week: data.kpis.weekRevenueSplit }
              : null
          }
        />

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[1.4fr_1fr]">
          <UpcomingBookingsSection
            upcoming={data.upcomingBookings}
            totalTodayCount={data.todayBookings.length}
            timezone={data.master.timezone}
            showWorkContext={data.showWorkContext}
          />
          <AttentionSection
            pendingBookings={data.pendingBookings}
            unansweredReviews={data.unansweredReviews}
            freeSlot={data.freeSlot}
            timezone={data.master.timezone}
            showWorkContext={data.showWorkContext}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
          <QuickActionsSection publicProfileUrl={publicProfileUrl} />
          <AnnouncementsSection />
        </div>
      </div>

    </>
  );
}
