import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;

/**
 * Connected accounts — Telegram + VK. We reuse the same battle-tested
 * sections from the notifications tab; they already encapsulate
 * connect / disconnect / toggle logic. The Notifications tab framing
 * emphasises the "channel for alerts" angle; here the framing
 * emphasises the "linked identity" angle, but the underlying
 * components are identical (`embedded` rendering keeps them flush).
 */
export function ConnectionsCard() {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h2 className="font-display text-base text-text-main">{T.connectionsHeading}</h2>
        <p className="mt-1 text-sm text-text-sec">{T.connectionsSubtitle}</p>
      </header>
      <div className="space-y-3">
        <TelegramNotificationsSection embedded />
        <VkNotificationsSection embedded />
      </div>
    </section>
  );
}
