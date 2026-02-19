import { redirect } from "next/navigation";
import { MasterClientsPage } from "@/features/master/components/master-clients-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export default async function MasterClientsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold text-text-main">Клиенты</h1>
      <p className="text-sm text-text-sec">База клиентов по вашим записям</p>
      <MasterClientsPage />
    </section>
  );
}
