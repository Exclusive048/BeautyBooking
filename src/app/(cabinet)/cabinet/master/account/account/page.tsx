import { redirect } from "next/navigation";
import { AccountTab } from "@/features/master/components/account/tabs/account-tab";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterAccountView } from "@/lib/master/account-view.service";

/**
 * `/cabinet/master/account/account` (fix-04a sub-page).
 *
 * Renders the plan / roles / export / danger-zone block. The
 * "account inside account" path is intentional — it mirrors the
 * three nav segments (notifications / security / account) so the
 * URL clearly names which sub-section a user is on.
 */
export default async function AccountRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getMasterAccountView({ userId: user.id });
  if (!data) redirect("/403");

  return <AccountTab data={data} />;
}
