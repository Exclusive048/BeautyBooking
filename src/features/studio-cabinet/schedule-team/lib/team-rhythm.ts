import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { patternPosition } from "@/lib/schedule/patterns-shared";
import { dayHoursToTemplate, type DayHoursDraft } from "@/features/master/components/schedule-settings/plan/lib/day-hours";

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График по очереди»: один график
 * «N через M» нескольким мастерам студии со сдвигом, чтобы рабочие дни
 * чередовались (два мастера 2 через 2 — каждый день работает один из них).
 *
 * Сдвиг — через дату отсчёта: мастер i начинает цикл на `i × N` дней позже
 * первого, а период у всех начинается в один день, поэтому до своей первой
 * смены мастер стоит в выходных позициях цикла. Запись — тем же пошаговым
 * окном (`PUT …/schedule/pattern`) по мастеру, второго писателя нет.
 */

export type TeamRhythmInput = {
  masterIds: string[];
  work: number;
  off: number;
  firstDay: string;
  staggered: boolean;
  hours: DayHoursDraft;
  endsOn: string | null;
};

export function buildTeamRhythmRequests(input: TeamRhythmInput) {
  const cycleDays = input.work + input.off;
  const days: Array<number | null> = [
    ...Array.from({ length: input.work }, () => 0),
    ...Array.from({ length: input.off }, () => null),
  ];
  return input.masterIds.map((masterId, index) => ({
    masterId,
    request: {
      templates: [dayHoursToTemplate(input.hours)],
      pattern: {
        kind: "CYCLE" as const,
        cycleDays,
        anchorOn: addDaysToDateKey(input.firstDay, input.staggered ? (index * input.work) % cycleDays : 0),
        startsOn: input.firstDay,
        endsOn: input.endsOn,
        days,
        resumePrevious: false,
      },
    },
  }));
}

/** Сколько мастеров работает в каждый из `count` дней от первого (для предпросмотра). */
export function teamRhythmCoverage(input: TeamRhythmInput, count: number): number[] {
  const requests = buildTeamRhythmRequests(input);
  return Array.from({ length: count }, (_, offset) => {
    const dateKey = addDaysToDateKey(input.firstDay, offset);
    return requests.filter(({ request }) => {
      const position = patternPosition(dateKey, request.pattern.anchorOn, request.pattern.cycleDays);
      return request.pattern.days[position] !== null;
    }).length;
  });
}
