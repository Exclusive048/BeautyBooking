import { redirect } from "next/navigation";
import { MasterCabinetShell } from "@/features/master/components/master-cabinet-shell";
import { getSessionUserId } from "@/lib/auth/session";

/**
 * The master cabinet shell (sidebar + main + mobile bottom-nav + trial
 * banner + manual-booking context) lives in `<MasterCabinetShell>` so the
 * shared `/cabinet/billing` (master scope) can render inside the same shell.
 * The per-page header lives inside each page as `<MasterPageHeader>`.
 */
export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  return <MasterCabinetShell userId={userId}>{children}</MasterCabinetShell>;
}
