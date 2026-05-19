import { StudioRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { ScheduleRequestsPage } from "@/features/studio-cabinet/schedule-requests/components/schedule-requests-page";
import { listScheduleRequestsForStudio } from "@/features/studio-cabinet/schedule-requests/server/list.service";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioScheduleRequestsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  let roles: StudioRole[];
  try {
    ({ studioId, roles } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const isAdmin = roles.some(
    (role) => role === StudioRole.ADMIN || role === StudioRole.OWNER
  );
  if (!isAdmin) redirect("/403");

  const data = await listScheduleRequestsForStudio(studioId);

  return <ScheduleRequestsPage data={data} />;
}
