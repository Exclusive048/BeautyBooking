"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.workContext;

type Props = {
  /** Профили мастера в студиях: id + название студии. */
  studioProfiles: Array<{ id: string; studioName: string }>;
  /** Выбранный профиль в студии; `null` — личное расписание. */
  activeStudioProfileId: string | null;
};

const PERSONAL = "personal";

/**
 * STUDIO-MASTER-PROFILES (этап 4): у мастера, работающего и лично, и в студии,
 * два расписания. Переключатель над вкладками настроек выбирает, какое правим:
 * личное (сохраняется сразу) или в студии (уходит на одобрение студии).
 * Соло-мастер переключателя не видит.
 */
export function ScheduleProfileSwitch({ studioProfiles, activeStudioProfileId }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      value={activeStudioProfileId ?? PERSONAL}
      onChange={(id) => {
        router.push(id === PERSONAL ? pathname : `${pathname}?profile=${encodeURIComponent(id)}`);
      }}
      items={[
        { id: PERSONAL, label: T.schedulePersonal },
        ...studioProfiles.map((profile) => ({
          id: profile.id,
          label: T.scheduleStudioTemplate.replace("{name}", profile.studioName),
        })),
      ]}
    />
  );
}
