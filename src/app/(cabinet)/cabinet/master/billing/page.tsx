import { redirect } from "next/navigation";
import { BillingPage } from "@/features/billing/components/billing-page";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUserId } from "@/lib/auth/session";

export const runtime = "nodejs";

export default async function MasterBillingRoute() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const hasProfile = await hasMasterProfile(userId);
  if (!hasProfile) redirect("/403");

  return <BillingPage scope="MASTER" />;
}
