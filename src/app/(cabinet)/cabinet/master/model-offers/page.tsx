import { redirect } from "next/navigation";
import { ModelOffersPage } from "@/features/model-offers/components/model-offers-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export default async function MasterModelOffersRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  await getCurrentMasterProviderId(user.id);

  return <ModelOffersPage />;
}
