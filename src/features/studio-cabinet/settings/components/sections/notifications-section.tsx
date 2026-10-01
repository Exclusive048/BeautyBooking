import { Smartphone } from "lucide-react";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { TelegramNotificationsSection } from "@/features/cabinet/components/telegram-notifications";
import { isTelegramEnabled } from "@/lib/env";
import * as UI_TEXT from "@/lib/ui/text";
import { SectionCard } from "../section-card";
import type { StudioNotificationsData } from "../../lib/types";
import { Badge } from "@/components/ui/badge";

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
 * Real channels surfaced today: in-app (Notification, always on),
 * Telegram (via TelegramLink + existing `<TelegramNotificationsSection>`).
 * VK is intentionally absent — VK-COMMUNITY-NOTIFY-01: VK notifications are
 * configured only in the general settings (/cabinet/settings). PWA push status
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
              className={data.pushEnabled ? "h-4 w-4 text-success-text" : "h-4 w-4 text-text-sec"}
              aria-hidden
            />
            <span className="text-sm font-medium text-text-main">{T.channelPush}</span>
          </div>
          <Badge size="xs" variant={data.pushEnabled ? "success" : "muted"}>
            {data.pushEnabled ? T.pushEnabled : T.pushDisabled}
          </Badge>
        </div>
        <p className="text-2xs text-text-sec">{T.pushHint}</p>
      </SectionCard>

      {/* FIX-TELEGRAM-KILLSWITCH: the entire Telegram card (header + control) is
          absent when the flag is off — no empty "Telegram"-titled card. */}
      {isTelegramEnabled && (
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
      )}

      {/* VK-COMMUNITY-NOTIFY-01: уведомлений ВКонтакте здесь нет намеренно —
          они настраиваются только в общих настройках (/cabinet/settings). */}
    </div>
  );
}
