import { redirect } from "next/navigation";
import { StudioClientsPage } from "@/features/studio/components/studio-clients-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export default async function StudioClientsRoute() {
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
        <h2 className="text-xl font-semibold">{t.clientsTitle}</h2>
        <p className="text-sm text-text-sec">{t.clientsSubtitle}</p>
      </header>
      <StudioClientsPage studioId={studioId} />
    </section>
  );
}
