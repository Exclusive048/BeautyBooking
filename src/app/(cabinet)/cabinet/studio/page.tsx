import { StudioRole, SubscriptionScope } from "@prisma/client";
import { redirect } from "next/navigation";
import { StudioDashboardPage } from "@/features/studio-cabinet/dashboard/components/studio-dashboard-page";
import { loadStudioHomeData } from "@/features/studio-cabinet/dashboard/server/dashboard-data.service";
import { loadStudioFreeWindows } from "@/features/studio-cabinet/schedule/server/schedule-data.service";
import { countStudioUnreadMessages } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentSubscriptionRow, isActiveTrial } from "@/lib/billing/get-current-subscription-row";
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

  const [data, freeWindows, studioInfo, setupGuide, subscription, unreadMessages] = await Promise.all([
    homePromise,
    freeWindowsPromise,
    getStudioShellInfo(studioId),
    // SETUP-GUIDE-01: «Первые шаги» — владельцу и администратору.
    administers ? loadStudioSetupGuide({ studioProviderId: access.providerId, studioId }) : Promise.resolve(null),
    // Пробный период — только на главной (раньше плашка стояла над каждой
    // страницей кабинета); строку уже прочитал layout — `cache` отдаёт её же.
    getCurrentSubscriptionRow(user.id, SubscriptionScope.STUDIO),
    // STUDIO-CHAT: новые сообщения клиентов — в «Требуют внимания».
    countStudioUnreadMessages(user.id, access.providerId),
  ]);

  const studioName = studioInfo?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;
  const trialEndsAt = isActiveTrial(subscription) ? subscription.trialEndsAt.toISOString() : null;

  return (
    <StudioDashboardPage
      data={data}
      studioName={studioName}
      unreadMessages={unreadMessages}
      freeWindows={freeWindows.masters}
      zoneIso={localDayRangeUtc(freeWindows.todayKey, data.timeZone).startUtc.toISOString()}
      setupGuide={setupGuide}
      trialEndsAt={trialEndsAt}
    />
  );
}
