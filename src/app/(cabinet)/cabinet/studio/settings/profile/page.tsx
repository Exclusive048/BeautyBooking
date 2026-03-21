import { redirect } from "next/navigation";

export default function StudioSettingsProfilePage() {
  redirect("/cabinet/studio/settings?tab=main");
}
