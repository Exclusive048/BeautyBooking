import { Smartphone } from "lucide-react";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { VkNotificationsSection } from "@/features/cabinet/components/vk-notifications";
import { UI_TEXT } from "@/lib/ui/text";
import { SectionCard } from "../section-card";
import type { StudioNotificationsData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.notifications;
const FG = UI_TEXT.billing.featureGate;

type Props = {
  data: StudioNotificationsData;
};

/**
 * STUDIO-NOTIFICATIONS-A info-banner promised that "Кто из команды
 * получает push — настраивается в Настройках студии" — this section
 * fulfils that promise.
 *
 * Real channels surfaced today (3): in-app (Notification, always on),
 * Telegram (via TelegramLink + existing `<TelegramNotificationsSection>`),
 * VK (via VkLink + existing `<VkNotificationsSection>`). PWA push status
 * is read-only here (subscription happens implicitly via the install
 * prompt — managing per-team toggles needs a schema model that doesn't
 * exist yet, tracked as backlog).
 *
 * SMS / per-NotificationType opt-outs are intentionally NOT shown — SMS
 * gateway is a pre-launch blocker (P1) and per-type preferences need a
 * `NotificationPreference` model. Both backlogged so the section doesn't
 * mock a control that wouldn't actually work.
 */
export function NotificationsSection({ data }: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title={T.channelsTitle} description={T.channelsDesc}>
        <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/30 p-3">
          <div className="flex items-center gap-2">
            <Smartphone
              className={data.pushEnabled ? "h-4 w-4 text-emerald-600 dark:text-emerald-400" : "h-4 w-4 text-text-sec"}
              aria-hidden
            />
            <span className="text-sm font-medium text-text-main">{T.channelPush}</span>
          </div>
          <span
            className={
              data.pushEnabled
                ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "rounded-full border border-border-subtle bg-bg-input px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-sec"
            }
          >
            {data.pushEnabled ? T.pushEnabled : T.pushDisabled}
          </span>
        </div>
        <p className="text-[11px] text-text-sec">{T.pushHint}</p>
      </SectionCard>

      <SectionCard title={T.telegramTitle} description={T.telegramDesc}>
        <FeatureGate
          feature="tgNotifications"
          scope="STUDIO"
          variant="inline"
          description={FG.telegramLocked}
        >
          <TelegramNotificationsSection embedded />
        </FeatureGate>
      </SectionCard>

      <SectionCard title={T.vkTitle} description={T.vkDesc}>
        <FeatureGate
          feature="vkNotifications"
          scope="STUDIO"
          variant="inline"
          description={FG.vkLocked}
        >
          <VkNotificationsSection embedded />
        </FeatureGate>
      </SectionCard>
    </div>
  );
}
