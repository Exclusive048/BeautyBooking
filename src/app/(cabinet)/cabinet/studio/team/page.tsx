import { redirect } from "next/navigation";
import { StudioTeamPage } from "@/features/studio/components/studio-team-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioTeamRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="text-sm text-neutral-600">Manage studio masters and open their cards.</p>
      </header>
      <StudioTeamPage studioId={studioId} />
    </section>
  );
}
