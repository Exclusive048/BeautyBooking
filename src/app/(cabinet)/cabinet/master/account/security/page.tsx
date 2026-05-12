import { redirect } from "next/navigation";
import { SecurityTab } from "@/features/master/components/account/tabs/security-tab";
import { getSessionUser } from "@/lib/auth/session";
import { getMasterAccountView } from "@/lib/master/account-view.service";

/**
 * `/cabinet/master/account/security` (fix-04a sub-page).
 *
 * Loads the master's identity + active sessions view and hands them
 * to the `<SecurityTab>` cards. The shared layout above already
 * guards the session, but we re-resolve the user here to keep the
 * page self-contained for `getMasterAccountView`.
 */
export default async function SecurityRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getMasterAccountView({ userId: user.id });
  if (!data) redirect("/403");

  return <SecurityTab identity={data.identity} sessions={data.sessions} />;
}
