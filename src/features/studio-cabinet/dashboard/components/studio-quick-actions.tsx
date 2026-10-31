"use client";

import { useState } from "react";
import { CalendarRange, Plus, Scissors, Share2, UserPlus } from "lucide-react";
import { QuickActionTile } from "@/features/cabinet/components/quick-action-tile";
import { HomeSection } from "@/features/cabinet/home/home-section";
import { useShareLink } from "@/features/cabinet/home/use-share-link";
import { CreateBookingDialog } from "@/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog";
import type { ScheduleMasterColumn } from "@/features/studio-cabinet/schedule/server/types";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetHome.quickActions;

type Props = {
  /** `Studio.id` — его ждёт окно новой записи. */
  studioId: string;
  masters: ScheduleMasterColumn[];
  services: Array<{ id: string; name: string; durationMin: number; priceKopeks: number; masterIds: string[] }>;
  /** Пояс студии (salon-tz) — окошки окна новой записи. */
  timezone: string;
  /** Публичная страница студии; `null` — адреса ещё нет, плитки «Поделиться» нет. */
  publicUrl: string | null;
};

/**
 * Быстрые действия главной студии (AI-CABINET-ANALYSIS): «Новая запись» — то же
 * окно, что в календаре и журнале записей, остальные ведут туда, где действие
 * делается. Видны владельцу и администратору студии.
 */
export function StudioQuickActions({ studioId, masters, services, timezone, publicUrl }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const share = useShareLink(publicUrl);

  return (
    <HomeSection title={T.title} subtitle={T.subtitle} testId="cabinet-home-quick-actions">
      <div className="grid grid-cols-2 gap-3">
        <QuickActionTile
          icon={Plus}
          label={T.addBooking}
          sublabel={T.addBookingSub}
          variant="primary"
          onClick={() => setCreateOpen(true)}
          className="col-span-2"
        />
        <QuickActionTile
          icon={UserPlus}
          label={T.inviteMaster}
          sublabel={T.inviteMasterSub}
          href="/cabinet/studio/team/add"
        />
        <QuickActionTile
          icon={CalendarRange}
          label={T.teamSchedule}
          sublabel={T.teamScheduleSub}
          href="/cabinet/studio/schedule/team"
        />
        <QuickActionTile
          icon={Scissors}
          label={T.addService}
          sublabel={T.addServiceSub}
          href="/cabinet/studio/services"
        />
        {share ? (
          <QuickActionTile icon={Share2} label={T.sharePage} sublabel={T.sharePageStudioSub} onClick={share} />
        ) : null}
      </div>

      <CreateBookingDialog
        studioId={studioId}
        masterId={null}
        startAtUtc={null}
        masters={masters}
        services={services}
        timezone={timezone}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </HomeSection>
  );
}
