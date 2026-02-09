import { redirect } from "next/navigation";
import { DashboardNavCards } from "@/features/studio-cabinet/components/dashboard-nav-cards";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { getStudioDashboardStats } from "@/lib/studio/dashboard.service";

function pluralize(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₸`;
}

const EMPTY_HINT = "Данные появятся после первых записей";

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
          title: "Записи сегодня",
          value: `${stats.bookingsTodayCount} ${pluralize(
            stats.bookingsTodayCount,
            "запись",
            "записи",
            "записей"
          )}`,
          subtitle: `На ${formatMoney(stats.bookingsTodayAmount)}`,
          href: "/cabinet/studio/calendar?view=day&date=today",
        },
        stats.mastersWorking === null
          ? {
              title: "Мастера в смене",
              value: "—",
              subtitle: EMPTY_HINT,
              href: "/cabinet/studio/team?filter=working_today",
              muted: true,
            }
          : {
              title: "Мастера в смене",
              value: `${stats.mastersWorking} из ${stats.mastersTotal}`,
              subtitle: "Работают сегодня",
              href: "/cabinet/studio/team?filter=working_today",
            },
        {
          title: "Новые клиенты",
          value: `${stats.newClientsCount} ${pluralize(
            stats.newClientsCount,
            "клиент",
            "клиента",
            "клиентов"
          )}`,
          subtitle: "За последние 24 ч",
          href: "/cabinet/studio/clients?sort=newest",
        },
        {
          title: "Отзывы",
          value: `${stats.reviewsCount} новых`,
          subtitle: "За последние 7 дней",
          href: "/cabinet/studio/settings/profile#reviews",
        },
      ]
    : [
        {
          title: "Записи сегодня",
          value: "—",
          subtitle: EMPTY_HINT,
          href: "/cabinet/studio/calendar?view=day&date=today",
          muted: true,
        },
        {
          title: "Мастера в смене",
          value: "—",
          subtitle: EMPTY_HINT,
          href: "/cabinet/studio/team?filter=working_today",
          muted: true,
        },
        {
          title: "Новые клиенты",
          value: "—",
          subtitle: EMPTY_HINT,
          href: "/cabinet/studio/clients?sort=newest",
          muted: true,
        },
        {
          title: "Отзывы",
          value: "—",
          subtitle: EMPTY_HINT,
          href: "/cabinet/studio/settings/profile#reviews",
          muted: true,
        },
      ];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-main">Главная</h1>
        <p className="mt-1 text-sm text-text-sec">Ключевые показатели студии на сегодня.</p>
      </div>

      <DashboardNavCards items={items} />
    </section>
  );
}
