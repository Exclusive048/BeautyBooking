import { redirect } from "next/navigation";
import { StudioTeamPage } from "@/features/studio/components/studio-team-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export default async function StudioTeamRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }
  const t = UI_TEXT.studioCabinet.routes;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t.teamTitle}</h2>
        <p className="text-sm text-text-sec">{t.teamSubtitle}</p>
      </header>
      <StudioTeamPage studioId={studioId} />
    </section>
  );
}
