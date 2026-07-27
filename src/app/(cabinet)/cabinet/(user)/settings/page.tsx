import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { isTelegramEnabled } from "@/lib/env";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { EmailNotificationsSection } from "@/features/cabinet/components/email-notifications";
import { PushNotificationsSection } from "@/features/cabinet/components/push-notifications";
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
        {/* FIX-TELEGRAM-KILLSWITCH: absent when off (no mount, no status fetch). */}
        {isTelegramEnabled && <TelegramNotificationsSection />}
        {/* CONSOLIDATE-EXTERNAL-LINKING-01: the VK notification section is hidden —
            VK Bot delivery isn't built (VK-NOTIFICATIONS backlog), so a toggle
            would promise delivery that can't happen. The component + settings
            endpoint + `VkLink.isEnabled` field are preserved (un-hidden when
            delivery ships). VK stays available as a login/identity provider in
            the profile «Связанные аккаунты» card. */}
        <EmailNotificationsSection />
        <PushNotificationsSection />
      </div>

      <DeleteAccountSection phone={user.phone ?? null} />
    </div>
  );
}
