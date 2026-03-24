import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import MasterProfileClient from "./MasterProfileClient";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterProfileRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.master.profile.headerTitle}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.master.profile.headerSubtitle}</p>
      </header>
      <MasterProfileClient />
    </section>
  );
}
