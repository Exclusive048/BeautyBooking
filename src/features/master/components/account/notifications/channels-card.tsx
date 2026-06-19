import { FeatureGate } from "@/components/billing/FeatureGate";
import { EmailNotificationsSection } from "@/features/cabinet/components/email-notifications";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.notifications;
const FG = UI_TEXT.billing.featureGate;

/**
 * Wraps the three channel-specific sections (Telegram / VK / Email)
 * into a single visually-cohesive card. Each child component is
 * battle-tested in `/cabinet/(user)/settings` — we just frame them.
 *
 * Push is **not** surfaced here yet: the existing sections cover the
 * 3 channels masters care about most, and a dedicated push UI lives
 * in the `<NotificationsBell>` permission flow already. A unified
 * push toggle is on the BACKLOG with the per-event grid.
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
      </div>
    </section>
  );
}
