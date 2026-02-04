import { redirect } from "next/navigation";
import { MasterProfilePage } from "@/features/master/components/master-profile-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export default async function MasterProfileRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Профиль</h2>
        <p className="text-sm text-neutral-600">О себе, услугах и портфолио.</p>
      </header>
      <MasterProfilePage />
    </section>
  );
}
