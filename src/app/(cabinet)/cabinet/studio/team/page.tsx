import { redirect } from "next/navigation";
import { TeamMemberCard } from "@/features/studio-cabinet/components/team-member-card";
import { TeamTabs } from "@/features/studio-cabinet/components/team-tabs";
import { StudioTeamPage, type StudioTeamMaster } from "@/features/studio/components/studio-team-page";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

type Props = {
  searchParams?: Promise<{ filter?: string }> | { filter?: string };
};

export default async function StudioTeamRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const filter = resolvedSearchParams?.filter === "working_today" ? "working_today" : "all";
  const mastersRes = await serverApiFetch<{ masters: StudioTeamMaster[] }>(
    `/api/studio/masters?studioId=${encodeURIComponent(studioId)}`
  );
  const masters = mastersRes.ok ? mastersRes.data.masters : [];
  const workingMasters = masters.filter((master) => master.isActive);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-main">Команда студии</h1>
        <p className="mt-1 text-sm text-text-sec">Управляйте мастерами и расписанием смен.</p>
      </div>

      <TeamTabs
        active={filter}
        allCount={masters.length}
        workingCount={workingMasters.length}
      />

      {filter === "working_today" ? (
        workingMasters.length > 0 ? (
          <div className="grid gap-4">
            {workingMasters.map((master, index) => (
              <TeamMemberCard
                key={master.id}
                name={master.name}
                specialty={master.title}
                statusLabel="🟢 Свободен"
                statusTone="free"
                shift="Смена 10:00–19:00"
                bookingsInfo={`Записей: ${2 + index} • Следующее окно 15:30`}
                actionHref={`/cabinet/studio/calendar?masterId=${master.id}&view=day&date=today`}
              />
            ))}
          </div>
        ) : (
          <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">
            Сегодня нет активных смен.
          </div>
        )
      ) : (
        <StudioTeamPage studioId={studioId} />
      )}
    </section>
  );
}
