import { redirect } from "next/navigation";
import { StudioServicesPage } from "@/features/studio/components/studio-services-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioSettingsServicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let studioId: string;
  try {
    ({ studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return <StudioServicesPage studioId={studioId} />;
}
