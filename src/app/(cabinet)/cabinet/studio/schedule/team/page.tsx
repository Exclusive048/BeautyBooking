import { StudioRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { TeamSchedulePage } from "@/features/studio-cabinet/schedule-team/components/team-schedule-page";
import { getSessionUser } from "@/lib/auth/session";
import { loadStudioTeamBoard } from "@/lib/schedule/team-board";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export const dynamic = "force-dynamic";

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График команды»: мастера студии × дни.
 * Владелец и администратор студии; данные — `loadStudioTeamBoard` (тот же
 * источник, что у `GET /api/studio/schedule/team`).
 */
export default async function StudioTeamScheduleRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let access: Awaited<ReturnType<typeof resolveCurrentStudioAccess>>;
  try {
    access = await resolveCurrentStudioAccess(user.id);
  } catch {
    redirect("/403");
  }
  if (!access.roles.some((role) => role === StudioRole.OWNER || role === StudioRole.ADMIN)) {
    redirect("/403");
  }

  const board = await loadStudioTeamBoard(access.providerId, null);
  return <TeamSchedulePage studioId={access.studioId} board={board} />;
}
