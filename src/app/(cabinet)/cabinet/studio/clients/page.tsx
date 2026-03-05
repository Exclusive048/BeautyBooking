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

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-text-main">{UI_TEXT.studioCabinet.clientsPage.title}</h1>
      <p className="text-sm text-text-sec">{UI_TEXT.studioCabinet.clientsPage.subtitle}</p>
      <StudioClientsPage studioId={studioId} />
    </section>
  );
}
