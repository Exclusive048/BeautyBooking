import { redirect } from "next/navigation";
import { MasterSchedulePage } from "@/features/master/components/master-schedule-page";
import { getSessionUser } from "@/lib/auth/session";

export default async function MasterScheduleRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <MasterSchedulePage />;
}
