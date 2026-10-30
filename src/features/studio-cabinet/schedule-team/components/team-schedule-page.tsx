import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import type { TeamBoardDto } from "@/lib/schedule/calendar-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { TeamBoard } from "./team-board";

const T = UI_TEXT.studioCabinet.scheduleTeam;

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — страница «График команды»: шапка в духе
 * «Настроек расписания» студии и доска (клиентская).
 */
export function TeamSchedulePage({ studioId, board }: { studioId: string; board: TeamBoardDto }) {
  return (
    <div className="min-w-0 space-y-5 lg:space-y-6">
      {/* «Назад» — в календарь студии: отдельной страницы `/cabinet/studio/schedule`
          нет, прежняя ссылка туда давала 404 (BACK-BUTTON-01). */}
      <StudioPageHeader backHref="/cabinet/studio/calendar" caption={T.breadcrumb} title={T.title} />
      <TeamBoard studioId={studioId} initialBoard={board} />
    </div>
  );
}
