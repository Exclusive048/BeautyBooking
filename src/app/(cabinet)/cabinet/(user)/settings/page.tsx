import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { DeleteAccountSection } from "@/features/cabinet/components/delete-account-section";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock
        title={UI_TEXT.clientCabinet.settings.title}
        subtitle={UI_TEXT.clientCabinet.settings.subtitle}
      />

      <div className="grid gap-4">
        <TelegramNotificationsSection />
        <VkNotificationsSection />
      </div>

      <DeleteAccountSection phone={user.phone ?? null} />
    </div>
  );
}
