import { redirect } from "next/navigation";
import { DashboardNavCards } from "@/features/studio-cabinet/components/dashboard-nav-cards";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { getStudioDashboardStats } from "@/lib/studio/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ${UI_TEXT.common.currencyRub}`;
}

export default async function StudioCabinetIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  let stats: Awaited<ReturnType<typeof getStudioDashboardStats>> | null = null;
  try {
    stats = await getStudioDashboardStats(studioId);
  } catch {
    stats = null;
  }

  const items = stats
    ? [
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.bookingsToday,
          value: `${stats.bookingsTodayCount} ${pluralize(
            stats.bookingsTodayCount,
            UI_TEXT.studioCabinet.dashboard.plural.booking.one,
            UI_TEXT.studioCabinet.dashboard.plural.booking.few,
            UI_TEXT.studioCabinet.dashboard.plural.booking.many
          )}`,
          subtitle: UI_TEXT.studioCabinet.dashboard.bookingsAmountPrefix.replace(
            "{amount}",
            formatMoney(stats.bookingsTodayAmount)
          ),
          href: "/cabinet/studio/calendar?view=day&date=today",
        },
        stats.mastersWorking === null
          ? {
              title: UI_TEXT.studioCabinet.dashboard.cards.mastersOnShift,
              value: "—",
              subtitle: UI_TEXT.studioCabinet.dashboard.emptyHint,
              href: "/cabinet/studio/team?filter=working_today",
              muted: true,
            }
          : {
              title: UI_TEXT.studioCabinet.dashboard.cards.mastersOnShift,
              value: UI_TEXT.studioCabinet.dashboard.mastersCountTemplate
                .replace("{working}", String(stats.mastersWorking))
                .replace("{total}", String(stats.mastersTotal)),
              subtitle: UI_TEXT.studioCabinet.dashboard.mastersWorking,
              href: "/cabinet/studio/team?filter=working_today",
            },
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.newClients,
          value: `${stats.newClientsCount} ${pluralize(
            stats.newClientsCount,
            UI_TEXT.studioCabinet.dashboard.plural.client.one,
            UI_TEXT.studioCabinet.dashboard.plural.client.few,
            UI_TEXT.studioCabinet.dashboard.plural.client.many
          )}`,
          subtitle: UI_TEXT.studioCabinet.dashboard.newClientsWindow,
          href: "/cabinet/studio/clients?sort=newest",
        },
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.reviews,
          value: UI_TEXT.studioCabinet.dashboard.reviewsValue.replace(
            "{count}",
            String(stats.reviewsCount)
          ),
          subtitle: UI_TEXT.studioCabinet.dashboard.reviewsWindow,
          href: "/cabinet/studio/settings?tab=settings#reviews",
        },
      ]
    : [
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.bookingsToday,
          value: "—",
          subtitle: UI_TEXT.studioCabinet.dashboard.emptyHint,
          href: "/cabinet/studio/calendar?view=day&date=today",
          muted: true,
        },
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.mastersOnShift,
          value: "—",
          subtitle: UI_TEXT.studioCabinet.dashboard.emptyHint,
          href: "/cabinet/studio/team?filter=working_today",
          muted: true,
        },
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.newClients,
          value: "—",
          subtitle: UI_TEXT.studioCabinet.dashboard.emptyHint,
          href: "/cabinet/studio/clients?sort=newest",
          muted: true,
        },
        {
          title: UI_TEXT.studioCabinet.dashboard.cards.reviews,
          value: "—",
          subtitle: UI_TEXT.studioCabinet.dashboard.emptyHint,
          href: "/cabinet/studio/settings?tab=settings#reviews",
          muted: true,
        },
      ];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-main">{UI_TEXT.studioCabinet.dashboard.title}</h1>
        <p className="mt-1 text-sm text-text-sec">{UI_TEXT.studioCabinet.dashboard.subtitle}</p>
      </div>

      <DashboardNavCards items={items} />
    </section>
  );
}
