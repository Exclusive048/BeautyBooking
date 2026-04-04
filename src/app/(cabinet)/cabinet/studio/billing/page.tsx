import { redirect } from "next/navigation";
import { BillingPage } from "@/features/billing/components/billing-page";
import { getSessionUserId } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";

export const runtime = "nodejs";

export default async function StudioBillingRoute() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(userId);
  if (!hasAccess) redirect("/403");

  return <BillingPage scope="STUDIO" />;
}
