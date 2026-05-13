import { AdminSettings } from "@/features/admin-cabinet/settings/components/admin-settings";
import { getAdminSettingsSnapshot } from "@/features/admin-cabinet/settings/server/settings-data.service";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const data = await getAdminSettingsSnapshot();
  return <AdminSettings data={data} />;
}
