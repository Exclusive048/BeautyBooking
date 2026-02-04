import { redirect } from "next/navigation";

export default async function ClientCabinetLegacyPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  if (sp?.tab === "profile") {
    redirect("/cabinet/client/profile");
  }

  redirect("/cabinet/client/bookings");
}
