import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { StudioServicesPage } from "@/features/studio/components/studio-services-page";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function StudioServicesRoute() {
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
        <h2 className="text-xl font-semibold text-text-main">{t.servicesTitle}</h2>
        <p className="text-sm text-text-sec">{t.servicesSubtitle}</p>
      </header>
      <StudioServicesPage studioId={studioId} />
    </section>
  );
}
