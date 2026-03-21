import { redirect } from "next/navigation";

export default function StudioProfileRoute() {
  redirect("/cabinet/studio/settings?tab=main");
}
