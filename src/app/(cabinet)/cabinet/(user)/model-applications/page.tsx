import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { ClientModelApplicationsPage } from "@/features/model-offers/components/client-model-applications-page";
import { getSessionUser } from "@/lib/auth/session";

export default async function ClientModelApplicationsRoute() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/cabinet/model-applications");
  }

  return (
    <div className="space-y-6">
      <HeaderBlock
        title="Мои заявки на модель"
        subtitle="Отслеживайте отклики на офферы и подтверждайте предложенное время."
      />
      <ClientModelApplicationsPage />
    </div>
  );
}
