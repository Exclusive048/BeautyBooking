import { redirect } from "next/navigation";
import { ModelOffersPage } from "@/features/model-offers/components/model-offers-page";
import { getSessionUser } from "@/lib/auth/session";

export default async function MasterModelOffersRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Master profile guard is handled by the parent layout.

  return <ModelOffersPage />;
}
