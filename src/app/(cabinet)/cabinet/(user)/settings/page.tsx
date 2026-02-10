import { HeaderBlock } from "@/components/ui/header-block";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <HeaderBlock title="Настройки" subtitle="Подключения и уведомления" />

      <div className="grid gap-4">
        <TelegramNotificationsSection />
        <VkNotificationsSection />
      </div>
    </div>
  );
}
