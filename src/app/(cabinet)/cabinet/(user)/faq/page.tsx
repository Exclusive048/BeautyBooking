import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientFaqPage } from "@/features/client-cabinet/faq/client-faq-page";

export default async function FaqPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/faq");

  return <ClientFaqPage />;
}
