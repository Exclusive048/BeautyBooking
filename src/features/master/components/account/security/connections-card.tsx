import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { isTelegramEnabled, isVkAuthEnabled } from "@/lib/env";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.account.security;

/**
 * Connected accounts — Telegram + VK. We reuse the same battle-tested
 * sections from the notifications tab; they already encapsulate
 * connect / disconnect / toggle logic. The Notifications tab framing
 * emphasises the "channel for alerts" angle; here the framing
 * emphasises the "linked identity" angle, but the underlying
 * components are identical (`embedded` rendering keeps them flush).
 *
 * FIX-EXTERNAL-GATING-01 (G-2/G-3): the enabled providers are computed ONCE
 * from the flags; the subtitle names exactly those (never a killed provider),
 * each row is gated on its own flag, and the whole section is absent when no
 * external provider is offered. Server component — `isVkAuthEnabled` (which
 * needs the server-only `VK_CLIENT_ID`) resolves correctly here.
 */
export function ConnectionsCard() {
  const providers: string[] = [];
  if (isTelegramEnabled) providers.push(T.connectionsProviderNames.telegram);
  if (isVkAuthEnabled) providers.push(T.connectionsProviderNames.vk);

  if (providers.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <header className="mb-4">
        <h2 className="font-display text-base text-text-main">{T.connectionsHeading}</h2>
        <p className="mt-1 text-sm text-text-sec">{T.connectionsSubtitle(providers)}</p>
      </header>
      <div className="space-y-3">
        {/* Each row gates on its own provider flag — the connect affordance
            never renders (and never 503s) for a disabled provider. Disconnect
            for a still-linked account lives in the user's profile card. */}
        {isTelegramEnabled && <TelegramNotificationsSection embedded />}
        {isVkAuthEnabled && <VkNotificationsSection embedded />}
      </div>
    </section>
  );
}
