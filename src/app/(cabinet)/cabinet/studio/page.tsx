import { StudioRole, SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { StudioDashboardPage } from "@/features/studio-cabinet/dashboard/components/studio-dashboard-page";
import { loadStudioHomeData } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import { loadStudioFreeWindows } from "@/features/studio-cabinet/schedule/server/schedule-data.service";
import { loadStudioCabinetShellExtras } from "@/features/studio-cabinet/schedule/server/shell-extras.service";
import { countStudioUnreadMessages } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentSubscriptionRow, isActiveTrial } from "@/lib/billing/get-current-subscription-row";
import { loadCabinetHomeInsights } from "@/lib/cabinet-insights/home";
import { env } from "@/lib/env";
import { loadStudioSetupGuide } from "@/lib/onboarding/setup-guide";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import * as UI_TEXT from "@/lib/ui/text";

export const dynamic = "force-dynamic";

/** Окошки на главной — неделя с сегодняшнего дня салона (как неделя календаря). */
const FREE_WINDOW_DAYS = 7;

export default async function StudioCabinetIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let access: Awaited<ReturnType<typeof resolveCurrentStudioAccess>>;
  try {
    access = await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }
  const { studioId } = access;
  const administers = access.roles.includes(StudioRole.OWNER) || access.roles.includes(StudioRole.ADMIN);

  const now = new Date();
  const homePromise = loadStudioHomeData({ studioId, now });
  // Окошкам нужен пояс студии — он приходит с главной (одно чтение студии).
  const freeWindowsPromise = homePromise.then((home) =>
    loadStudioFreeWindows({
      studioId,
      providerId: home.providerId,
      timeZone: home.timeZone,
      days: FREE_WINDOW_DAYS,
      now,
    }),
  );

  // SETUP-GUIDE-01: «Первые шаги» — владельцу и администратору. Советы молчат о
  // шагах, на которые карточка ещё ведёт, поэтому идут следом за ней.
  const setupGuidePromise = administers
    ? loadStudioSetupGuide({ studioProviderId: access.providerId, studioId })
    : Promise.resolve(null);
  // AI-CABINET-ANALYSIS: быстрые действия, ИИ-разбор, советы — тоже им.
  const lowerPromise = administers
    ? Promise.all([
        setupGuidePromise.then((guide) =>
          loadCabinetHomeInsights({ userId: user.id, scope: "studio", setupGuide: guide, now }),
        ),
        loadStudioCabinetShellExtras(studioId),
      ])
    : Promise.resolve(null);

  const [data, freeWindows, studioInfo, setupGuide, subscription, unreadMessages, lowerData] = await Promise.all([
    homePromise,
    freeWindowsPromise,
    getStudioShellInfo(studioId),
    setupGuidePromise,
    // Пробный период — только на главной (раньше плашка стояла над каждой
    // страницей кабинета); строку уже прочитал layout — `cache` отдаёт её же.
    getCurrentSubscriptionRow(user.id, SubscriptionScope.STUDIO),
    // STUDIO-CHAT: новые сообщения клиентов — в «Требуют внимания».
    countStudioUnreadMessages(user.id, access.providerId),
    lowerPromise,
  ]);

  const studioName = studioInfo?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;
  const trialEndsAt = isActiveTrial(subscription) ? subscription.trialEndsAt.toISOString() : null;
  const publicHref = studioInfo?.publicHref ?? null;
  const lower = lowerData
    ? {
        insights: lowerData[0],
        quickActions: {
          studioId,
          masters: lowerData[1].scheduleMasters,
          // Окну записи хватает базовых длительности и цены: у мастера их показывает пикер.
          services: lowerData[1].services.map(({ id, name, durationMin, priceKopeks, masterIds }) => ({
            id,
            name,
            durationMin,
            priceKopeks,
            masterIds,
          })),
          publicUrl: publicHref ? `${env.NEXT_PUBLIC_APP_URL ?? ""}${publicHref}` : null,
        },
      }
    : null;

  return (
    <StudioDashboardPage
      data={data}
      studioName={studioName}
      unreadMessages={unreadMessages}
      freeWindows={freeWindows.masters}
      zoneIso={localDayRangeUtc(freeWindows.todayKey, data.timeZone).startUtc.toISOString()}
      setupGuide={setupGuide}
      trialEndsAt={trialEndsAt}
      lower={lower}
    />
  );
}
