import { redirect } from "next/navigation";
import { StudioProfilePage } from "@/features/studio/components/studio-profile-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioSettingsProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  let studioId: string;
  try {
    ({ providerId, studioId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return <StudioProfilePage providerId={providerId} studioId={studioId} />;
}
