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
      <header className="space-y-1">
        <p className="font-mono text-3xs uppercase tracking-[0.18em] text-text-sec">{T.breadcrumb}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">{T.title}</h1>
      </header>
      <TeamBoard studioId={studioId} initialBoard={board} />
    </div>
  );
}
