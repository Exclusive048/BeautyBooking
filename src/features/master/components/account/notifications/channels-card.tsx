import { FeatureGate } from "@/components/billing/FeatureGate";
import { EmailNotificationsSection } from "@/features/cabinet/components/email-notifications";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { PushNotificationsSection } from "@/features/cabinet/components/push-notifications";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.notifications;
const FG = UI_TEXT.billing.featureGate;

/**
 * Wraps the channel-specific sections (Telegram / VK / Email / Push) into a
 * single visually-cohesive card. Each child component is shared with
 * `/cabinet/(user)/settings` — we just frame them.
 *
 * FIX-EXP-NOTIFICATIONS (EXP-027): the push toggle is now surfaced here too.
 * It replaces the removed gesture-less on-load permission request — masters
 * (like clients) enable push via this explicit, gesture-gated control.
 */
export function ChannelsCard() {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h2 className="font-display text-base text-text-main">{T.channelsHeading}</h2>
        <p className="mt-1 text-sm text-text-sec">{T.channelsSubtitle}</p>
      </header>
      <div className="space-y-3">
        <FeatureGate
          feature="tgNotifications"
          scope="MASTER"
          variant="inline"
          description={FG.telegramLocked}
        >
          <TelegramNotificationsSection embedded />
        </FeatureGate>
        <FeatureGate
          feature="vkNotifications"
          scope="MASTER"
          variant="inline"
          description={FG.vkLocked}
        >
          <VkNotificationsSection embedded />
        </FeatureGate>
        <EmailNotificationsSection />
        <PushNotificationsSection />
      </div>
    </section>
  );
}
