import { redirect } from "next/navigation";
import { StudioClientsPage } from "@/features/studio/components/studio-clients-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

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
      <header>
        <h2 className="text-xl font-semibold">Clients</h2>
        <p className="text-sm text-neutral-600">Simple client base from studio bookings.</p>
      </header>
      <StudioClientsPage studioId={studioId} />
    </section>
  );
}
