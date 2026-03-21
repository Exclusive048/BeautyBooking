import { redirect } from "next/navigation";

export default function NewStudioServicePage() {
  redirect("/cabinet/studio/settings?tab=services");
}
