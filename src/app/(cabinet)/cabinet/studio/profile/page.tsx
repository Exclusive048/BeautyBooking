import { redirect } from "next/navigation";
import { StudioProfilePage } from "@/features/studio/components/studio-profile-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export default async function StudioProfileRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  try {
    ({ providerId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Studio profile</h2>
        <p className="text-sm text-neutral-600">Settings, avatar, banner and portfolio for public studio page.</p>
      </header>
      <StudioProfilePage providerId={providerId} />
    </section>
  );
}
