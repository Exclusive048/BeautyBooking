import { BarChart3, Calendar, Clock, Wallet, type LucideIcon } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { pluralize } from "@/lib/utils/pluralize";
import type { StudioScheduleView } from "../lib/view-state";
import type { ScheduleKpis } from "../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sublabel: string;
};

type Props = {
  kpis: ScheduleKpis;
  /** Показатели — выбранного периода: день или неделя. */
  view: StudioScheduleView;
  /** Период содержит сегодняшний день салона: окошки считаются с «сейчас». */
  includesToday: boolean;
};

// PWA-FIX-10 — локальная копия плитки заменена общим `<StatTile>`: иконка ушла
// в строку подписи вместо собственной строки с `mb-2`.
function Card({ icon, label, value, unit, sublabel }: Tile) {
  return <StatTile icon={icon} label={label} value={value} unit={unit} sublabel={sublabel} />;
}

export function ScheduleKpiRow({ kpis, view, includesToday }: Props) {
  const week = view === "week";
  const tiles: Tile[] = [
    {
      icon: Calendar,
      label: week ? T.bookingsWeek : T.bookingsDay,
      value: UI_FMT.count(kpis.bookingsCount),
      sublabel: T.bookingsConfirmedTemplate.replace("{count}", String(kpis.bookingsConfirmedCount)),
    },
    {
      icon: Wallet,
      label: week ? T.revenueWeek : T.revenueDay,
      value: UI_FMT.priceLabel(kpis.revenueKopeks),
      sublabel: T.revenueSubtitle,
    },
    {
      icon: BarChart3,
      label: T.occupancy,
      value: String(kpis.occupancyPercent),
      unit: "%",
      sublabel: T.occupancyContextTemplate.replace("{masters}", String(kpis.mastersOnShift)),
    },
    {
      icon: Clock,
      label: T.freeWindows,
      value: UI_FMT.count(kpis.freeWindowsCount),
      sublabel: includesToday ? T.freeWindowsHintNow : T.freeWindowsHintPeriod,
    },
  ];

  return (
    <StatTileGrid columns={4}>
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </StatTileGrid>
  );
}

/**
 * SCHEDULE-FLEX-DATE-NAV — свёрнутые показатели: одна строка вместо четырёх
 * плиток (на телефоне — по умолчанию, место под записи).
 */
export function ScheduleKpiSummary({ kpis }: { kpis: ScheduleKpis }) {
  return (
    <p className="truncate text-sm tabular-nums text-text-main">
      {[
        `${UI_FMT.count(kpis.bookingsCount)} ${pluralize(kpis.bookingsCount, T.summaryBookingOne, T.summaryBookingFew, T.summaryBookingMany)}`,
        UI_FMT.priceLabel(kpis.revenueKopeks),
        T.summaryLoadTemplate.replace("{pct}", String(kpis.occupancyPercent)),
        `${UI_FMT.count(kpis.freeWindowsCount)} ${pluralize(kpis.freeWindowsCount, T.summaryWindowOne, T.summaryWindowFew, T.summaryWindowMany)}`,
      ].join(" · ")}
    </p>
  );
}
