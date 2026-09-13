import Link from "next/link";
import { Bell, Clock, Inbox, MailOpen } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { MasterNotificationsKpi } from "@/lib/master/notifications.service";
import { UI_TEXT } from "@/lib/ui/text";
import { pluralizeRu } from "./lib/group-by-day";

const T = UI_TEXT.cabinetMaster.notifications.kpi;

type Props = {
  stats: MasterNotificationsKpi;
};

/**
 * Полоса показателей вверху страницы уведомлений мастера.
 *
 * PWA-FIX-10 — переведена на общий `<StatTile>`. Что изменилось по сути, помимо
 * компактности: акценты `rose`/`amber` были собраны сырыми парами
 * `border-rose-200 dark:border-rose-900/40` + `text-rose-600 dark:text-rose-400`,
 * то есть ровно та форма, которую UI-26/27 запрещает в статусных поверхностях, —
 * теперь это токены `danger`/`warning` с встроенной тёмной темой. Плитка push
 * тоже уложилась в примитив (статус = значение, подсказка/CTA = подпись), и
 * отдельного компонента под неё больше нет.
 */
export function NotificationsKpiCards({ stats }: Props) {
  const todayWord = pluralizeRu(
    stats.todayCount,
    T.todayWordOne,
    T.todayWordFew,
    T.todayWordMany
  );
  const waitingWord = pluralizeRu(
    stats.waitingCount,
    T.waitingWordOne,
    T.waitingWordFew,
    T.waitingWordMany
  );

  return (
    <StatTileGrid columns={4}>
      <StatTile
        icon={MailOpen}
        label={T.unreadLabel}
        value={T.unreadValueTemplate
          .replace("{unread}", String(stats.unreadCount))
          .replace("{total}", String(stats.totalCount))}
        accent={stats.unreadCount > 0 ? "danger" : "neutral"}
      />
      <StatTile
        icon={Inbox}
        label={T.todayLabel}
        value={T.todayValueTemplate
          .replace("{count}", String(stats.todayCount))
          .replace("{word}", todayWord)}
      />
      <StatTile
        icon={Clock}
        label={T.waitingLabel}
        value={
          stats.waitingCount > 0
            ? T.waitingValueTemplate
                .replace("{count}", String(stats.waitingCount))
                .replace("{word}", waitingWord)
            : T.waitingNone
        }
        accent={stats.waitingCount > 0 ? "warning" : "neutral"}
      />
      <StatTile
        icon={Bell}
        label={T.pushLabel}
        value={stats.pushEnabled ? T.pushOn : T.pushOff}
        accent={stats.pushEnabled ? "success" : "warning"}
        className={stats.pushEnabled ? "bg-success-surface" : "bg-warning-surface"}
        sublabel={
          stats.pushEnabled ? (
            T.pushOnHint
          ) : (
            <Link
              href="/cabinet/master/account?tab=notifications"
              className="text-accent-text underline-offset-2 hover:underline"
            >
              {T.pushOffCta}
            </Link>
          )
        }
      />
    </StatTileGrid>
  );
}
