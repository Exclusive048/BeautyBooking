import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { isTelegramEnabled, isVkAuthEnabled } from "@/lib/env";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { EmailNotificationsSection } from "@/features/cabinet/components/email-notifications";
import { AppSetupCard } from "@/features/cabinet/components/app-setup-card";
import { DeleteAccountSection } from "@/features/cabinet/components/delete-account-section";
import { MarketingConsentSection } from "@/features/cabinet/components/marketing-consent";
import { getSessionUser } from "@/lib/auth/session";
import * as UI_TEXT from "@/lib/ui/text";
import { getVkCommunity } from "@/lib/vk/community";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // VK-COMMUNITY-NOTIFY-01: канал ВКонтакте есть, только когда в админке
  // сохранён ключ сообщества. Нет — секцию не монтируем вовсе.
  const vkNotificationsAvailable = (await getVkCommunity()) !== null;

  return (
    <div className="space-y-6">
      <HeaderBlock
        title={UI_TEXT.clientCabinet.settings.title}
        subtitle={UI_TEXT.clientCabinet.settings.subtitle}
      />

      <div className="grid gap-4">
        {/* FIX-TELEGRAM-KILLSWITCH: absent when off (no mount, no status fetch). */}
        {isTelegramEnabled && <TelegramNotificationsSection />}
        {/* VK-COMMUNITY-NOTIFY-01: уведомления ВКонтакте настраиваются ТОЛЬКО
            здесь (решение владельца) — одна секция на все роли, в кабинетах
            мастера и студии её нет. Привязка ВК — в профиле. */}
        {vkNotificationsAvailable && <VkNotificationsSection connectAvailable={isVkAuthEnabled} />}
        <EmailNotificationsSection />
        {/* PWA-ONBOARDING-01: push-тумблер живёт рядом с инструкцией по установке —
            на iPhone уведомления работают только в установленном приложении. */}
        <AppSetupCard variant="settings" />
        {/* RKN-FIX-18: согласие на маркетинг — ОДИН компонент на все роли
            (/cabinet/settings в глобальном topbar-меню, как и /cabinet/profile).
            Стоит рядом с удалением аккаунта намеренно: именно туда
            маршрутизируется отзыв ПДн, который тумблером не делается. */}
        <MarketingConsentSection />
      </div>

      <DeleteAccountSection phone={user.phone ?? null} />
    </div>
  );
}
