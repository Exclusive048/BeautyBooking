import { redirect } from "next/navigation";

export default function StudioSettingsServicesPage() {
  redirect("/cabinet/studio/settings?tab=services");
}
