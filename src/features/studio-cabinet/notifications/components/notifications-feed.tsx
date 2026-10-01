import { Bell } from "lucide-react";
import * as UI_TEXT from "@/lib/ui/text";
import type { NotificationDayGroup } from "../lib/types";
import { NotificationCard } from "./notification-card";

const T = UI_TEXT.studioCabinet.notificationsV2;

type Props = {
  groups: NotificationDayGroup[];
  /** Пояс студии — в нём дни групп и время карточек. */
  timeZone: string;
};

export function NotificationsFeed({ groups, timeZone }: Props) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
        <Bell className="h-10 w-10 text-text-sec/30" aria-hidden />
        <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
        <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.dayKey} className="space-y-2">
          <h3 className="eyebrow">
            {group.label}
          </h3>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={item.id}>
                <NotificationCard item={item} timeZone={timeZone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
