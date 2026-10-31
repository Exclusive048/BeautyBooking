import { redirect } from "next/navigation";
import { BillingPage } from "@/features/billing/components/billing-page";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUserId } from "@/lib/auth/session";

export const runtime = "nodejs";

export default async function MasterBillingRoute() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const hasProfile = await hasMasterProfile(userId);
  if (!hasProfile) redirect("/403");

  // Поля страницы — как у остальных страниц кабинета: без них на телефоне
  // заголовок и карточки тарифов прижимались к краю экрана.
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-6 pt-3 md:px-6 md:pt-4 lg:px-8">
      <BillingPage scope="MASTER" />
    </div>
  );
}
