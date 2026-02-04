import { redirect } from "next/navigation";
import { StudioServicesPage } from "@/features/studio/components/studio-services-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioServicesRoute() {
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
        <h2 className="text-xl font-semibold">Services</h2>
        <p className="text-sm text-neutral-600">Price list and master assignment.</p>
      </header>
      <StudioServicesPage studioId={studioId} />
    </section>
  );
}
