import { redirect } from "next/navigation";
import { MasterSchedulePage } from "@/features/master/components/master-schedule-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderContext } from "@/lib/master/access";

export default async function MasterScheduleRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = await getCurrentMasterProviderContext(user.id);

  return <MasterSchedulePage isStudioManaged={Boolean(provider.studioId)} />;
}
