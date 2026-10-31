"use client";

import { CalendarCog, ImagePlus, Plus, Scissors, Share2 } from "lucide-react";
import { QuickActionTile } from "@/features/cabinet/components/quick-action-tile";
import { HomeSection } from "@/features/cabinet/home/home-section";
import { useShareLink } from "@/features/cabinet/home/use-share-link";
import { useManualBooking } from "@/features/master/components/manual-booking/manual-booking-provider";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetHome.quickActions;

type Props = {
  /** Публичная страница мастера; `null` — адреса ещё нет, плитки «Поделиться» нет. */
  publicProfileUrl: string | null;
};

/**
 * Быстрые действия главной мастера (AI-CABINET-ANALYSIS). Каждая плитка делает
 * то, что написано: «Новая запись» открывает ручную запись на месте, «Изменить
 * день» — календарь расписания (кисть «Выходной» и «Свои часы» на дату),
 * остальные ведут на страницу, где действие делается. Прежние плитки «Закрыть
 * время» и «Пригласить» вели в расписание и клиентов, где такого действия нет.
 */
export function QuickActionsSection({ publicProfileUrl }: Props) {
  const { open: openManualBooking } = useManualBooking();
  const share = useShareLink(publicProfileUrl);

  return (
    <HomeSection title={T.title} subtitle={T.subtitle} testId="cabinet-home-quick-actions">
      <div className="grid grid-cols-2 gap-3">
        <QuickActionTile
          icon={Plus}
          label={T.addBooking}
          sublabel={T.addBookingSub}
          variant="primary"
          onClick={() => openManualBooking()}
          className="col-span-2"
        />
        <QuickActionTile
          icon={CalendarCog}
          label={T.editDay}
          sublabel={T.editDaySub}
          href="/cabinet/master/schedule/settings"
        />
        {share ? (
          <QuickActionTile icon={Share2} label={T.sharePage} sublabel={T.sharePageSub} onClick={share} />
        ) : null}
        <QuickActionTile
          icon={Scissors}
          label={T.addService}
          sublabel={T.addServiceSub}
          href="/cabinet/master/services"
        />
        <QuickActionTile
          icon={ImagePlus}
          label={T.addPortfolio}
          sublabel={T.addPortfolioSub}
          href="/cabinet/master/portfolio"
        />
      </div>
    </HomeSection>
  );
}
