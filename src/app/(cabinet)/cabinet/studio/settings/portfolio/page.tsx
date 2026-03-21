import { redirect } from "next/navigation";

export default function StudioSettingsPortfolioPage() {
  redirect("/cabinet/studio/settings?tab=portfolio");
}
